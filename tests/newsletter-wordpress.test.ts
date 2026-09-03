import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { mockEverflowOfferCatalog } from "@/src/adapters/offers/mock-everflow";
import { BenzingaShapedFixtureSource } from "@/src/adapters/rss/benzinga-shaped-rss";
import { MockWordPress } from "@/src/adapters/publishing/mock-wordpress";
import {
  NEWSLETTER_POC_TAG,
  WordPressComNewsletterPublisher,
  wordpressNewsletterContent,
  wordpressNewsletterTitle,
} from "@/src/adapters/publishing/wordpress-com-newsletter";
import {
  wordpressCreatePostUrl,
  wordpressGetPostUrl,
  wordpressUpdatePostUrl,
} from "@/src/adapters/publishing/wordpress-http";
import { MOCK_ITERABLE_PROVIDER, MockIterable } from "@/src/adapters/staging/mock-iterable";
import { openContentDatabase } from "@/src/db/database";
import type { ContentDatabase } from "@/src/db/database";
import { applyContentFoundationMigrations } from "@/src/db/migrate";
import { newsletterPublications } from "@/src/db/schema";
import type { ApprovedNewsletterSnapshot } from "@/src/domain/approval";
import { layoutBlockKey } from "@/src/domain/layout";
import { ContentRepository } from "@/src/repositories/content-repository";
import { WorkbenchRepository } from "@/src/repositories/workbench-repository";
import {
  NEWSLETTER_WORDPRESS_PROVIDER,
  type NewsletterPublicationResult,
  type NewsletterPublisher,
} from "@/src/publishing/newsletter-publisher";
import type {
  ContentPublisher,
  PublishingRequest,
  PublishingResult,
} from "@/src/publishing/content-publisher";
import { WorkbenchService, WorkbenchServiceError } from "@/src/workbench/workbench-service";

const fixturePath = path.join(
  process.cwd(),
  "tests/fixtures/benzinga-shaped-financial-news.xml",
);
const firstStoryId = "story_6c43c8a1944281017858d68b";
const secondStoryId = "story_5c6a67b4a9b7cb360ddc7877";
const firstOfferId = "offer_harborline_savings";
const ACCESS_TOKEN = "test-token-secret-value-not-for-production";
const SITE_ID = "241031857";
const LIVE_URL = "https://example.wordpress.com/2026/09/03/poc-newsletter/";

class RecordingStoryPublisher implements ContentPublisher {
  readonly calls: PublishingRequest[] = [];

  async publish(request: PublishingRequest): Promise<PublishingResult> {
    this.calls.push(request);
    return {
      sourceStoryId: request.story.id,
      provider: "MockWordPress",
      mode: "mock",
      status: "published",
      externalPostId: `mock_wp_${request.story.id}`,
      url: `https://wordpress-fixture.test/posts/mock_wp_${request.story.id}`,
    };
  }
}

class RecordingNewsletterPublisher implements NewsletterPublisher {
  readonly provider = NEWSLETTER_WORDPRESS_PROVIDER;
  readonly publishCalls: ApprovedNewsletterSnapshot[] = [];
  readonly updateCalls: Array<{ postId: string; snapshot: ApprovedNewsletterSnapshot }> = [];
  readonly readCalls: string[] = [];
  externalPostId = "90001";
  url = LIVE_URL;

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
    this.readCalls.push(externalPostId);
    return {
      status: "published",
      provider: this.provider,
      externalPostId,
      url: this.url,
      approvalFingerprint: "",
    };
  }
}

type CapturedRequest = {
  url: string;
  method: string;
  authorization: string | null;
  contentType: string | null;
  body: string;
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createFetch(response: Response | (() => Promise<Response> | Response)) {
  const captured: CapturedRequest[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const resolved = new Request(input, init);
    captured.push({
      url: resolved.url,
      method: resolved.method,
      authorization: resolved.headers.get("authorization"),
      contentType: resolved.headers.get("content-type"),
      body: await resolved.text(),
    });
    return typeof response === "function" ? response() : response;
  };
  return { captured, fetchImpl };
}

function assertNoSecret(value: unknown): void {
  const serialized = JSON.stringify(value);
  assert.equal(serialized.includes(ACCESS_TOKEN), false);
  assert.equal(/Bearer\s+(?!\[redacted\])\S+/i.test(serialized), false);
}

function installNetworkGuard(): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("Newsletter WordPress tests must not make a real network request.");
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

const controlledSnapshot: ApprovedNewsletterSnapshot = {
  draftId: "draft_active_poc",
  approvalFingerprint: "a".repeat(64),
  generatedInputFingerprint: "b".repeat(64),
  subject: "Controlled newsletter subject",
  preheader: "Controlled preheader",
  html: "<html lang=\"en\"><body><article>First story</article></body></html>",
  plainText: "First story",
};

async function withWorkbench(
  run: (
    service: WorkbenchService,
    db: ContentDatabase,
    extras: {
      mockPublisher: RecordingStoryPublisher;
      realPublisher: RecordingStoryPublisher;
      newsletterPublisher: RecordingNewsletterPublisher | null;
    },
  ) => Promise<void>,
  options: { newsletterPublisher?: RecordingNewsletterPublisher | null } = {},
): Promise<void> {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "newsletter-wp-"));
  const databasePath = path.join(temporaryDirectory, "workbench.db");
  const { client, db } = openContentDatabase(databasePath);
  applyContentFoundationMigrations(db);
  const mockPublisher = new RecordingStoryPublisher();
  const realPublisher = new RecordingStoryPublisher();
  const newsletterPublisher =
    options.newsletterPublisher === undefined
      ? new RecordingNewsletterPublisher()
      : options.newsletterPublisher;
  const service = new WorkbenchService(
    new BenzingaShapedFixtureSource(fixturePath),
    new ContentRepository(db),
    new WorkbenchRepository(db),
    mockPublisher,
    realPublisher,
    mockEverflowOfferCatalog,
    new MockIterable(),
    newsletterPublisher,
  );
  await service.fetchLatestStories();

  try {
    await run(service, db, { mockPublisher, realPublisher, newsletterPublisher });
  } finally {
    client.close();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

async function assembleApprovedNewsletter(service: WorkbenchService): Promise<void> {
  await service.addStories([firstStoryId, secondStoryId]);
  await service.addOffer(firstOfferId);
  await service.generateNewsletter();
  await service.approveNewsletter();
}

test("generate makes no WordPress provider write", async () => {
  const restoreFetch = installNetworkGuard();
  try {
    await withWorkbench(async (service, _db, extras) => {
      await service.addStories([firstStoryId, secondStoryId]);
      await service.addOffer(firstOfferId);
      await service.generateNewsletter();
      const state = await service.load();

      assert.equal(extras.mockPublisher.calls.length, 0);
      assert.equal(extras.realPublisher.calls.length, 0);
      assert.equal(extras.newsletterPublisher?.publishCalls.length, 0);
      assert.equal(extras.newsletterPublisher?.updateCalls.length, 0);
      assert.equal(state.generatedNewsletterIsCurrent, true);
      assert.match(state.generatedNewsletter?.html ?? "", /fixture\.example\.test/);
      assert.doesNotMatch(state.generatedNewsletter?.html ?? "", /wordpress-fixture\.test/);
    });
  } finally {
    restoreFetch();
  }
});

test("cannot publish without current approval", async () => {
  const restoreFetch = installNetworkGuard();
  try {
    await withWorkbench(async (service, _db, extras) => {
      await service.addStories([firstStoryId, secondStoryId]);
      await assert.rejects(
        service.publishApprovedNewsletter(),
        (error: unknown) =>
          error instanceof WorkbenchServiceError && error.code === "NEWSLETTER_REQUIRED",
      );

      await service.generateNewsletter();
      await assert.rejects(
        service.publishApprovedNewsletter(),
        (error: unknown) =>
          error instanceof WorkbenchServiceError && error.code === "APPROVAL_REQUIRED",
      );
      assert.equal(extras.newsletterPublisher?.publishCalls.length, 0);
    });
  } finally {
    restoreFetch();
  }
});

test("newsletter publisher receives the exact approved snapshot", async () => {
  const restoreFetch = installNetworkGuard();
  try {
    await withWorkbench(async (service, _db, extras) => {
      await assembleApprovedNewsletter(service);
      const approved = (await service.load()).approvedNewsletter;
      assert.ok(approved);
      await service.publishApprovedNewsletter();

      assert.equal(extras.newsletterPublisher?.publishCalls.length, 1);
      assert.deepEqual(extras.newsletterPublisher?.publishCalls[0], approved);
      assert.equal(extras.newsletterPublisher?.publishCalls[0]?.html, approved.html);
      assert.equal(extras.newsletterPublisher?.publishCalls[0]?.subject, approved.subject);
    });
  } finally {
    restoreFetch();
  }
});

test("first current approval creates one WordPress publication and stores the real post ID and URL", async () => {
  const restoreFetch = installNetworkGuard();
  try {
    await withWorkbench(async (service, db, extras) => {
      await assembleApprovedNewsletter(service);
      const publication = await service.publishApprovedNewsletter();
      const state = await service.load();
      const persisted = db.select().from(newsletterPublications).all();

      assert.equal(extras.newsletterPublisher?.publishCalls.length, 1);
      assert.equal(extras.newsletterPublisher?.updateCalls.length, 0);
      assert.equal(publication.status, "published");
      assert.equal(publication.externalPostId, "90001");
      assert.equal(publication.url, LIVE_URL);
      assert.equal(state.newsletterPublicationIsCurrent, true);
      assert.deepEqual(state.newsletterPublication, publication);
      assert.equal(persisted.length, 1);
      assert.equal(persisted[0]?.externalPostId, "90001");
      assert.equal(persisted[0]?.url, LIVE_URL);
    });
  } finally {
    restoreFetch();
  }
});

test("same approval repeated does not create another WordPress write", async () => {
  const restoreFetch = installNetworkGuard();
  try {
    await withWorkbench(async (service, db, extras) => {
      await assembleApprovedNewsletter(service);
      const first = await service.publishApprovedNewsletter();
      const second = await service.publishApprovedNewsletter();
      const persisted = db.select().from(newsletterPublications).all();

      assert.deepEqual(second, first);
      assert.equal(extras.newsletterPublisher?.publishCalls.length, 1);
      assert.equal(extras.newsletterPublisher?.updateCalls.length, 0);
      assert.equal(persisted.length, 1);
    });
  } finally {
    restoreFetch();
  }
});

test("layout change makes WordPress publication stale and a new approval updates the same post", async () => {
  const restoreFetch = installNetworkGuard();
  try {
    await withWorkbench(async (service, db, extras) => {
      await assembleApprovedNewsletter(service);
      const first = await service.publishApprovedNewsletter();
      const originalHtml = (await service.load()).approvedNewsletter?.html ?? "";
      const layout = (await service.load()).draft.layout;
      await service.reorderLayout([
        layoutBlockKey({ kind: "sponsored", offerId: firstOfferId }),
        layoutBlockKey({ kind: "story", storyId: firstStoryId }),
        layoutBlockKey({ kind: "story", storyId: secondStoryId }),
      ]);
      const afterReorder = await service.load();

      assert.equal(afterReorder.generatedNewsletterIsCurrent, false);
      assert.equal(afterReorder.approvalIsCurrent, false);
      assert.equal(afterReorder.newsletterPublicationIsCurrent, false);
      await assert.rejects(
        service.publishApprovedNewsletter(),
        (error: unknown) =>
          error instanceof WorkbenchServiceError && error.code === "NEWSLETTER_STALE",
      );
      await assert.rejects(
        service.stageApprovedNewsletter(),
        (error: unknown) =>
          error instanceof WorkbenchServiceError && error.code === "NEWSLETTER_STALE",
      );

      await service.generateNewsletter();
      await service.approveNewsletter();
      const updated = await service.publishApprovedNewsletter();
      const state = await service.load();
      const persisted = db.select().from(newsletterPublications).all();

      assert.equal(extras.newsletterPublisher?.publishCalls.length, 1);
      assert.equal(extras.newsletterPublisher?.updateCalls.length, 1);
      assert.equal(extras.newsletterPublisher?.updateCalls[0]?.postId, first.externalPostId);
      assert.equal(updated.externalPostId, first.externalPostId);
      assert.equal(updated.url, first.url);
      assert.notEqual(updated.approvalFingerprint, first.approvalFingerprint);
      assert.equal(state.newsletterPublicationIsCurrent, true);
      assert.equal(persisted.length, 1);
      assert.notEqual(state.approvedNewsletter?.html, originalHtml);
      assert.deepEqual(extras.newsletterPublisher?.updateCalls[0]?.snapshot, state.approvedNewsletter);
    });
  } finally {
    restoreFetch();
  }
});

test("stage is rejected without a current WordPress publication and allowed when both approval and publication are current", async () => {
  const restoreFetch = installNetworkGuard();
  try {
    await withWorkbench(async (service, _db, extras) => {
      await assembleApprovedNewsletter(service);
      await assert.rejects(
        service.stageApprovedNewsletter(),
        (error: unknown) =>
          error instanceof WorkbenchServiceError && error.code === "WORDPRESS_PUBLICATION_REQUIRED",
      );

      await service.publishApprovedNewsletter();
      const receipt = await service.stageApprovedNewsletter();
      const repeated = await service.stageApprovedNewsletter();
      const state = await service.load();

      assert.equal(receipt.provider, MOCK_ITERABLE_PROVIDER);
      assert.equal(receipt.status, "staged");
      assert.deepEqual(repeated, receipt);
      assert.equal(state.stagingReceipt?.externalDraftId, receipt.externalDraftId);
      assert.equal(extras.newsletterPublisher?.publishCalls.length, 1);
    }, {});

    await withWorkbench(async (service) => {
      await assembleApprovedNewsletter(service);
      await service.publishApprovedNewsletter();
      await service.reorderLayout(
        (await service.load()).draft.layout.map((block) =>
          block.kind === "story"
            ? layoutBlockKey({ kind: "story", storyId: block.story.id })
            : layoutBlockKey({ kind: "sponsored", offerId: block.offer.id }),
        ).reverse(),
      );
      await service.generateNewsletter();
      await service.approveNewsletter();
      await assert.rejects(
        service.stageApprovedNewsletter(),
        (error: unknown) =>
          error instanceof WorkbenchServiceError && error.code === "WORDPRESS_PUBLICATION_STALE",
      );
    });
  } finally {
    restoreFetch();
  }
});

test("unconfigured WordPress publishing fails honestly without a provider write", async () => {
  const restoreFetch = installNetworkGuard();
  try {
    await withWorkbench(async (service) => {
      await assembleApprovedNewsletter(service);
      await assert.rejects(
        service.publishApprovedNewsletter(),
        (error: unknown) =>
          error instanceof WorkbenchServiceError && error.code === "WORDPRESS_NOT_CONFIGURED",
      );
      const state = await service.load();
      assert.equal(state.wordpressConfigured, false);
      assert.equal(state.newsletterPublication, null);
    }, { newsletterPublisher: null });
  } finally {
    restoreFetch();
  }
});

test("WordPress.com newsletter publisher uses the official create, update, and get contracts", async () => {
  const restoreFetch = installNetworkGuard();
  try {
    const created = createFetch(jsonResponse(200, {
      ID: 90001,
      status: "publish",
      URL: LIVE_URL,
    }));
    const publisher = new WordPressComNewsletterPublisher(
      { siteId: SITE_ID, accessToken: ACCESS_TOKEN },
      { fetch: created.fetchImpl },
    );

    const createdResult = await publisher.publish(controlledSnapshot);
    assert.equal(created.captured.length, 1);
    assert.equal(created.captured[0]?.url, wordpressCreatePostUrl(SITE_ID));
    assert.equal(created.captured[0]?.method, "POST");
    assert.equal(created.captured[0]?.authorization, `Bearer ${ACCESS_TOKEN}`);
    assert.equal(created.captured[0]?.contentType, "application/x-www-form-urlencoded");
    const createBody = new URLSearchParams(created.captured[0]?.body);
    assert.equal(createBody.get("title"), wordpressNewsletterTitle(controlledSnapshot));
    assert.equal(createBody.get("content"), wordpressNewsletterContent(controlledSnapshot));
    assert.equal(createBody.get("status"), "publish");
    assert.equal(createBody.get("publicize"), "false");
    assert.equal(createBody.get("tags"), NEWSLETTER_POC_TAG);
    assert.match(createBody.get("content") ?? "", /POC TEST POST/);
    assert.match(createBody.get("content") ?? "", /First story/);
    assert.deepEqual(createdResult, {
      status: "published",
      provider: NEWSLETTER_WORDPRESS_PROVIDER,
      externalPostId: "90001",
      url: LIVE_URL,
      approvalFingerprint: controlledSnapshot.approvalFingerprint,
    });
    assertNoSecret(createdResult);

    const updated = createFetch(jsonResponse(200, {
      ID: 90001,
      status: "publish",
      URL: LIVE_URL,
    }));
    const updater = new WordPressComNewsletterPublisher(
      { siteId: SITE_ID, accessToken: ACCESS_TOKEN },
      { fetch: updated.fetchImpl },
    );
    const updatedResult = await updater.update("90001", controlledSnapshot);
    assert.equal(updated.captured[0]?.url, wordpressUpdatePostUrl(SITE_ID, "90001"));
    assert.equal(updated.captured[0]?.method, "POST");
    assert.equal(updatedResult.externalPostId, "90001");
    assert.equal(updatedResult.status === "published" ? updatedResult.url : null, LIVE_URL);

    const read = createFetch(jsonResponse(200, {
      ID: 90001,
      status: "publish",
      URL: LIVE_URL,
    }));
    const reader = new WordPressComNewsletterPublisher(
      { siteId: SITE_ID, accessToken: ACCESS_TOKEN },
      { fetch: read.fetchImpl },
    );
    await reader.readExisting("90001");
    assert.equal(read.captured[0]?.method, "GET");
    assert.equal(read.captured[0]?.url, `${wordpressGetPostUrl(SITE_ID, "90001")}?context=edit`);
  } finally {
    restoreFetch();
  }
});

test("WordPress.com newsletter diagnostics redact secrets and do not leak raw payloads", async () => {
  const restoreFetch = installNetworkGuard();
  try {
    const { fetchImpl } = createFetch(jsonResponse(401, {
      error: "unauthorized",
      message: `secret ${ACCESS_TOKEN} must not leak`,
      content: "raw provider body",
    }));
    const publisher = new WordPressComNewsletterPublisher(
      { siteId: SITE_ID, accessToken: ACCESS_TOKEN },
      { fetch: fetchImpl },
    );
    const result = await publisher.publish(controlledSnapshot);

    assert.equal(result.status, "failed");
    if (result.status === "failed") {
      assert.equal(result.diagnostic.includes(ACCESS_TOKEN), false);
      assert.match(result.diagnostic, /\[redacted\]/);
      assert.doesNotMatch(result.diagnostic, /raw provider body/);
    }
    assertNoSecret(result);

    const unknownPublisher = new WordPressComNewsletterPublisher(
      { siteId: SITE_ID, accessToken: ACCESS_TOKEN },
      {
        fetch: async () => {
          throw new TypeError("fetch failed");
        },
      },
    );
    const unknown = await unknownPublisher.publish(controlledSnapshot);
    assert.equal(unknown.status, "unknown");
    assertNoSecret(unknown);
  } finally {
    restoreFetch();
  }
});

test("no real Iterable network call or email send exists", () => {
  const restoreFetch = installNetworkGuard();
  try {
    const roots = ["app", "src"];
    const files = roots.flatMap((root) => collectSourceFiles(path.join(process.cwd(), root)));
    const mockIterableSource = readFileSync(
      path.join(process.cwd(), "src/adapters/staging/mock-iterable.ts"),
      "utf8",
    );
    const serviceSource = readFileSync(
      path.join(process.cwd(), "src/workbench/workbench-service.ts"),
      "utf8",
    );

    assert.doesNotMatch(serviceSource, /resolveMockWordPressForStoryBlocks/);
    assert.doesNotMatch(mockIterableSource, /fetch\(|https?:\/\/|iterable\.com|api\.iterable/);
    assert.doesNotMatch(mockIterableSource, /Date\.now|randomUUID|Math\.random/);

    for (const filePath of files) {
      const source = readFileSync(filePath, "utf8");
      assert.doesNotMatch(
        source,
        /nodemailer|sendgrid|@sendgrid|resend\.emails|ses\.sendEmail|transporter\.sendMail/,
      );
      assert.doesNotMatch(source, /iterable\.com|api\.iterable/);
    }
  } finally {
    restoreFetch();
  }
});
