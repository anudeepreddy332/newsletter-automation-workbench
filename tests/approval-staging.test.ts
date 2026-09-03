import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { eq } from "drizzle-orm";

import { mockEverflowOfferCatalog } from "@/src/adapters/offers/mock-everflow";
import { BenzingaShapedFixtureSource } from "@/src/adapters/rss/benzinga-shaped-rss";
import { MockWordPress } from "@/src/adapters/publishing/mock-wordpress";
import { MOCK_ITERABLE_PROVIDER, MockIterable } from "@/src/adapters/staging/mock-iterable";
import { NEWSLETTER_WORDPRESS_PROVIDER } from "@/src/publishing/newsletter-publisher";
import type {
  NewsletterPublicationResult,
  NewsletterPublisher,
} from "@/src/publishing/newsletter-publisher";
import type { NewsletterStager, StagingHandoff, StagingResult } from "@/src/staging/newsletter-stager";
import { openContentDatabase } from "@/src/db/database";
import { applyContentFoundationMigrations } from "@/src/db/migrate";
import type { ContentDatabase } from "@/src/db/database";
import { approvedNewsletters, publishingResults, stagingReceipts } from "@/src/db/schema";
import type { ApprovedNewsletterSnapshot } from "@/src/domain/approval";
import {
  approvedSnapshotFromGenerated,
  fingerprintApprovedNewsletter,
} from "@/src/newsletter/fingerprint";
import { ContentRepository } from "@/src/repositories/content-repository";
import { WorkbenchRepository } from "@/src/repositories/workbench-repository";
import { WorkbenchService, WorkbenchServiceError } from "@/src/workbench/workbench-service";

const fixturePath = path.join(
  process.cwd(),
  "tests/fixtures/benzinga-shaped-financial-news.xml",
);
const firstStoryId = "story_6c43c8a1944281017858d68b";
const secondStoryId = "story_5c6a67b4a9b7cb360ddc7877";
const firstOfferId = "offer_harborline_savings";
const secondOfferId = "offer_northstar_brokerage";
const thirdOfferId = "offer_ledgerbay_software";

class RecordingNewsletterPublisher implements NewsletterPublisher {
  readonly provider = NEWSLETTER_WORDPRESS_PROVIDER;
  readonly publishCalls: ApprovedNewsletterSnapshot[] = [];
  readonly updateCalls: Array<{ postId: string; snapshot: ApprovedNewsletterSnapshot }> = [];
  externalPostId = "90001";
  url = "https://example.wordpress.com/2026/09/03/poc-newsletter/";

  async publish(approvedSnapshot: ApprovedNewsletterSnapshot): Promise<NewsletterPublicationResult> {
    this.publishCalls.push(approvedSnapshot);
    return {
      status: "published",
      provider: this.provider,
      externalPostId: this.externalPostId,
      url: this.url,
      approvalFingerprint: approvedSnapshot.approvalFingerprint,
    };
  }

  async update(
    externalPostId: string,
    approvedSnapshot: ApprovedNewsletterSnapshot,
  ): Promise<NewsletterPublicationResult> {
    this.updateCalls.push({ postId: externalPostId, snapshot: approvedSnapshot });
    return {
      status: "published",
      provider: this.provider,
      externalPostId,
      url: this.url,
      approvalFingerprint: approvedSnapshot.approvalFingerprint,
    };
  }

  async readExisting(externalPostId: string): Promise<NewsletterPublicationResult> {
    return {
      status: "published",
      provider: this.provider,
      externalPostId,
      url: this.url,
      approvalFingerprint: "",
    };
  }
}

class RecordingStager implements NewsletterStager {
  readonly provider: string;
  readonly calls: StagingHandoff[] = [];

  constructor(private readonly inner: NewsletterStager = new MockIterable()) {
    this.provider = inner.provider;
  }

  stage(handoff: StagingHandoff): StagingResult {
    this.calls.push(handoff);
    return this.inner.stage(handoff);
  }
}

function installNetworkGuard(): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("Phase 5 tests must not make a real network request.");
  }) as typeof fetch;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectSourceFiles(resolved);
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [resolved] : [];
  });
}

async function withWorkbench(
  run: (service: WorkbenchService, db: ContentDatabase, stager: RecordingStager) => Promise<void>,
): Promise<void> {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "newsletter-approval-"));
  const databasePath = path.join(temporaryDirectory, "workbench.db");
  const { client, db } = openContentDatabase(databasePath);
  applyContentFoundationMigrations(db);
  const stager = new RecordingStager();
  const newsletterPublisher = new RecordingNewsletterPublisher();
  const service = new WorkbenchService(
    new BenzingaShapedFixtureSource(fixturePath),
    new ContentRepository(db),
    new WorkbenchRepository(db),
    new MockWordPress(),
    null,
    mockEverflowOfferCatalog,
    stager,
    newsletterPublisher,
  );
  await service.fetchLatestStories();

  try {
    await run(service, db, stager);
  } finally {
    client.close();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

async function generateCurrentNewsletter(service: WorkbenchService): Promise<void> {
  await service.addStory(firstStoryId);
  await service.addStory(secondStoryId);
  await service.addOffer(firstOfferId);
  await service.addOffer(secondOfferId);
  await service.generateNewsletter();
}

test("cannot approve when no newsletter exists", async () => {
  const restoreFetch = installNetworkGuard();
  try {
    await withWorkbench(async (service) => {
      await service.addStory(firstStoryId);
      await assert.rejects(
        service.approveNewsletter(),
        (error: unknown) =>
          error instanceof WorkbenchServiceError && error.code === "NEWSLETTER_REQUIRED",
      );
      assert.equal((await service.load()).approvalIsCurrent, false);
    });
  } finally {
    restoreFetch();
  }
});

test("cannot approve stale generated output", async () => {
  await withWorkbench(async (service) => {
    await generateCurrentNewsletter(service);
    await service.addOffer(thirdOfferId);
    await assert.rejects(
      service.approveNewsletter(),
      (error: unknown) =>
        error instanceof WorkbenchServiceError && error.code === "NEWSLETTER_STALE",
    );
  });
});

test("current generated newsletter can be approved", async () => {
  await withWorkbench(async (service) => {
    await generateCurrentNewsletter(service);
    await service.approveNewsletter();
    const state = await service.load();

    assert.equal(state.generatedNewsletterIsCurrent, true);
    assert.equal(state.approvalIsCurrent, true);
    assert.ok(state.approvedNewsletter);
  });
});

test("approval is bound to exact subject, preheader, HTML, and plain text", async () => {
  await withWorkbench(async (service) => {
    await generateCurrentNewsletter(service);
    const generated = (await service.load()).generatedNewsletter;
    assert.ok(generated);
    await service.approveNewsletter();
    const approved = (await service.load()).approvedNewsletter;
    assert.ok(approved);

    assert.equal(approved.subject, generated.subject);
    assert.equal(approved.preheader, generated.preheader);
    assert.equal(approved.html, generated.html);
    assert.equal(approved.plainText, generated.plainText);
    assert.equal(approved.generatedInputFingerprint, generated.inputFingerprint);
    assert.equal(
      approved.approvalFingerprint,
      fingerprintApprovedNewsletter({
        generatedInputFingerprint: generated.inputFingerprint,
        subject: generated.subject,
        preheader: generated.preheader,
        html: generated.html,
        plainText: generated.plainText,
      }),
    );
  });
});

test("approval remains valid while exact newsletter identity is unchanged", async () => {
  await withWorkbench(async (service) => {
    await generateCurrentNewsletter(service);
    await service.approveNewsletter();
    const approved = (await service.load()).approvedNewsletter;
    await service.generateNewsletter();
    const afterSameGeneration = await service.load();

    assert.equal(afterSameGeneration.approvalIsCurrent, true);
    assert.deepEqual(afterSameGeneration.approvedNewsletter, approved);
    assert.deepEqual(afterSameGeneration.generatedNewsletter, {
      subject: approved?.subject,
      preheader: approved?.preheader,
      html: approved?.html,
      plainText: approved?.plainText,
      inputFingerprint: approved?.generatedInputFingerprint,
    });
  });
});

test("story change invalidates approval for staging", async () => {
  await withWorkbench(async (service) => {
    await generateCurrentNewsletter(service);
    await service.approveNewsletter();
    await service.removeStory(secondStoryId);
    const state = await service.load();

    assert.equal(state.generatedNewsletterIsCurrent, false);
    assert.equal(state.approvalIsCurrent, false);
    await assert.rejects(
      service.stageApprovedNewsletter(),
      (error: unknown) =>
        error instanceof WorkbenchServiceError && error.code === "NEWSLETTER_STALE",
    );
  });
});

test("offer change invalidates approval for staging", async () => {
  await withWorkbench(async (service) => {
    await generateCurrentNewsletter(service);
    await service.approveNewsletter();
    await service.addOffer(thirdOfferId);
    const state = await service.load();

    assert.equal(state.generatedNewsletterIsCurrent, false);
    assert.equal(state.approvalIsCurrent, false);
    await assert.rejects(
      service.stageApprovedNewsletter(),
      (error: unknown) =>
        error instanceof WorkbenchServiceError && error.code === "NEWSLETTER_STALE",
    );
  });
});

test("story publishing URL change does not invalidate generated output", async () => {
  await withWorkbench(async (service, db) => {
    await generateCurrentNewsletter(service);
    await service.approveNewsletter();
    const draft = (await service.load()).draft;
    db.insert(publishingResults)
      .values({
        draftId: draft.id,
        publicationId: draft.publicationId!,
        storyId: firstStoryId,
        provider: "WordPress.com",
        mode: "real",
        status: "published",
        externalPostId: "88421",
        url: "https://example.wordpress.com/2026/09/02/controlled-story/",
        diagnostic: null,
      })
      .run();
    const state = await service.load();

    assert.equal(state.generatedNewsletterIsCurrent, true);
    assert.equal(state.approvalIsCurrent, true);
  });
});

test("regenerate and reapprove restores staging eligibility", async () => {
  await withWorkbench(async (service) => {
    await generateCurrentNewsletter(service);
    await service.approveNewsletter();
    await service.addOffer(thirdOfferId);
    await service.generateNewsletter();
    await service.approveNewsletter();
    await service.publishApprovedNewsletter();
    const receipt = await service.stageApprovedNewsletter();
    const state = await service.load();

    assert.equal(state.generatedNewsletterIsCurrent, true);
    assert.equal(state.approvalIsCurrent, true);
    assert.equal(receipt.status, "staged");
    assert.deepEqual(state.stagingReceipt, receipt);
  });
});

test("cannot stage without approval", async () => {
  await withWorkbench(async (service) => {
    await generateCurrentNewsletter(service);
    await assert.rejects(
      service.stageApprovedNewsletter(),
      (error: unknown) =>
        error instanceof WorkbenchServiceError && error.code === "APPROVAL_REQUIRED",
    );
  });
});

test("cannot stage stale approval after a new generation", async () => {
  await withWorkbench(async (service) => {
    await generateCurrentNewsletter(service);
    await service.approveNewsletter();
    await service.addOffer(thirdOfferId);
    await service.generateNewsletter();
    const state = await service.load();

    assert.equal(state.generatedNewsletterIsCurrent, true);
    assert.equal(state.approvalIsCurrent, false);
    await assert.rejects(
      service.stageApprovedNewsletter(),
      (error: unknown) =>
        error instanceof WorkbenchServiceError && error.code === "APPROVAL_STALE",
    );
  });
});

test("MockIterable staging succeeds for a current approved snapshot", async () => {
  await withWorkbench(async (service, _db, stager) => {
    await generateCurrentNewsletter(service);
    await service.approveNewsletter();
    await service.publishApprovedNewsletter();
    const receipt = await service.stageApprovedNewsletter();

    assert.equal(stager.calls.length, 1);
    assert.equal(receipt.provider, MOCK_ITERABLE_PROVIDER);
    assert.equal(receipt.status, "staged");
    assert.match(receipt.externalDraftId, /^mock_iterable_draft_[a-f0-9]{16}$/);
  });
});

test("staged content exactly matches the approved snapshot", async () => {
  await withWorkbench(async (service, _db, stager) => {
    await generateCurrentNewsletter(service);
    const generated = (await service.load()).generatedNewsletter;
    assert.ok(generated);
    await service.approveNewsletter();
    const approved = (await service.load()).approvedNewsletter;
    assert.ok(approved);
    const publication = await service.publishApprovedNewsletter();
    await service.stageApprovedNewsletter();

    assert.deepEqual(stager.calls[0]?.approvedSnapshot, approved);
    assert.equal(stager.calls[0]?.wordpressPostId, publication.externalPostId);
    assert.equal(stager.calls[0]?.wordpressUrl, publication.url);
    assert.equal(stager.calls[0]?.wordpressApprovalFingerprint, approved.approvalFingerprint);
    assert.equal(stager.calls[0]?.approvedSnapshot.subject, generated.subject);
    assert.equal(stager.calls[0]?.approvedSnapshot.preheader, generated.preheader);
    assert.equal(stager.calls[0]?.approvedSnapshot.html, generated.html);
    assert.equal(stager.calls[0]?.approvedSnapshot.plainText, generated.plainText);
  });
});

test("staging the same approved snapshot twice returns the same receipt", async () => {
  await withWorkbench(async (service, db, stager) => {
    await generateCurrentNewsletter(service);
    await service.approveNewsletter();
    await service.publishApprovedNewsletter();
    const first = await service.stageApprovedNewsletter();
    const second = await service.stageApprovedNewsletter();
    const persisted = db.select().from(stagingReceipts).all();

    assert.deepEqual(second, first);
    assert.equal(stager.calls.length, 1);
    assert.equal(persisted.length, 1);
    assert.equal((await service.load()).stagingReceipt?.externalDraftId, first.externalDraftId);
  });
});

test("a different newly approved snapshot may create a distinct receipt", async () => {
  await withWorkbench(async (service, db) => {
    await generateCurrentNewsletter(service);
    await service.approveNewsletter();
    await service.publishApprovedNewsletter();
    const first = await service.stageApprovedNewsletter();
    await service.addOffer(thirdOfferId);
    await service.generateNewsletter();
    await service.approveNewsletter();
    await service.publishApprovedNewsletter();
    const second = await service.stageApprovedNewsletter();
    const persisted = db.select().from(stagingReceipts).all();

    assert.notEqual(second.externalDraftId, first.externalDraftId);
    assert.notEqual(second.approvalFingerprint, first.approvalFingerprint);
    assert.equal(persisted.length, 2);
  });
});

test("MockIterable ID generation is deterministic", () => {
  const restoreFetch = installNetworkGuard();
  try {
    const stager = new MockIterable();
    const snapshot = {
      draftId: "draft_active_poc",
      approvalFingerprint: "a".repeat(64),
      generatedInputFingerprint: "b".repeat(64),
      subject: "Controlled subject",
      preheader: "Controlled preheader",
      html: "<html lang=\"en\"><body>Controlled</body></html>",
      plainText: "Controlled",
    };
    const consistent = approvedSnapshotFromGenerated(snapshot.draftId, {
      subject: snapshot.subject,
      preheader: snapshot.preheader,
      html: snapshot.html,
      plainText: snapshot.plainText,
      inputFingerprint: snapshot.generatedInputFingerprint,
    });

    const wordpressEvidence = {
      wordpressPostId: "90001",
      wordpressUrl: "https://example.wordpress.com/2026/09/03/poc-newsletter/",
      wordpressApprovalFingerprint: consistent.approvalFingerprint,
    };
    const first = stager.stage({ approvedSnapshot: consistent, ...wordpressEvidence });
    const second = stager.stage({ approvedSnapshot: consistent, ...wordpressEvidence });
    const differentSnapshot = approvedSnapshotFromGenerated("draft_active_poc", {
      ...consistent,
      subject: "Different subject",
      inputFingerprint: consistent.generatedInputFingerprint,
    });
    const different = stager.stage({
      approvedSnapshot: differentSnapshot,
      wordpressPostId: "90001",
      wordpressUrl: "https://example.wordpress.com/2026/09/03/poc-newsletter/",
      wordpressApprovalFingerprint: differentSnapshot.approvalFingerprint,
    });

    assert.deepEqual(second, first);
    assert.notEqual(different.externalDraftId, first.externalDraftId);
    assert.match(first.externalDraftId, /^mock_iterable_draft_[a-f0-9]{16}$/);
  } finally {
    restoreFetch();
  }
});

test("inconsistent approved snapshot identity is rejected", async () => {
  await withWorkbench(async (service, db) => {
    await generateCurrentNewsletter(service);
    await service.approveNewsletter();
    const approved = (await service.load()).approvedNewsletter;
    assert.ok(approved);
    db.update(approvedNewsletters)
      .set({ subject: "Tampered subject" })
      .where(eq(approvedNewsletters.draftId, approved.draftId))
      .run();

    await assert.rejects(
      service.stageApprovedNewsletter(),
      (error: unknown) =>
        error instanceof WorkbenchServiceError && error.code === "APPROVAL_MISMATCH",
    );
  });
});

test("no real Iterable network request or email send exists", () => {
  const restoreFetch = installNetworkGuard();
  try {
    const roots = ["app", "src"];
    const files = roots.flatMap((root) => collectSourceFiles(path.join(process.cwd(), root)));
    const mockIterableSource = readFileSync(
      path.join(process.cwd(), "src/adapters/staging/mock-iterable.ts"),
      "utf8",
    );

    assert.doesNotMatch(mockIterableSource, /fetch\(|https?:\/\/|iterable\.com|api\.iterable/);
    assert.doesNotMatch(mockIterableSource, /Date\.now|randomUUID|Math\.random/);

    for (const filePath of files) {
      const source = readFileSync(filePath, "utf8");
      assert.doesNotMatch(
        source,
        /nodemailer|sendgrid|@sendgrid|resend\.emails|ses\.sendEmail|transporter\.sendMail|sendEmail\(/,
      );
      assert.doesNotMatch(source, /Campaign launched|email was sent|Delivered to recipients/);
    }
  } finally {
    restoreFetch();
  }
});
