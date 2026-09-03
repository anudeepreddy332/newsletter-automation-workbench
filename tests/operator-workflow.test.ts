import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { BenzingaShapedFixtureSource } from "@/src/adapters/rss/benzinga-shaped-rss";
import { mockEverflowOfferCatalog } from "@/src/adapters/offers/mock-everflow";
import { MOCK_WORDPRESS_PROVIDER, MockWordPress } from "@/src/adapters/publishing/mock-wordpress";
import { REAL_WORDPRESS_PROVIDER } from "@/src/adapters/publishing/real-wordpress";
import { MOCK_ITERABLE_PROVIDER, MockIterable } from "@/src/adapters/staging/mock-iterable";
import type { ApprovedNewsletterSnapshot } from "@/src/domain/approval";
import type {
  NewsletterPublicationResult,
  NewsletterPublisher,
} from "@/src/publishing/newsletter-publisher";
import { NEWSLETTER_WORDPRESS_PROVIDER } from "@/src/publishing/newsletter-publisher";
import type { ContentSource } from "@/src/content/content-source";
import { openContentDatabase } from "@/src/db/database";
import { applyContentFoundationMigrations } from "@/src/db/migrate";
import type { ContentDatabase } from "@/src/db/database";
import { contentFeeds, publishingResults, stories } from "@/src/db/schema";
import { layoutBlockKey } from "@/src/domain/layout";
import type { ContentFeed, Story } from "@/src/domain/story";
import type {
  ContentPublisher,
  PublishingRequest,
  PublishingResult,
} from "@/src/publishing/content-publisher";
import { ContentRepository } from "@/src/repositories/content-repository";
import { WorkbenchRepository } from "@/src/repositories/workbench-repository";
import { WorkbenchService, WorkbenchServiceError } from "@/src/workbench/workbench-service";

const fixturePath = path.join(
  process.cwd(),
  "tests/fixtures/benzinga-shaped-financial-news.xml",
);
const firstStoryId = "story_6c43c8a1944281017858d68b";
const secondStoryId = "story_5c6a67b4a9b7cb360ddc7877";
const thirdStoryId = "story_f4144563fa09bd90887c8750";
const firstOfferId = "offer_harborline_savings";
const secondOfferId = "offer_northstar_brokerage";
const thirdOfferId = "offer_ledgerbay_software";

class CountingSource implements ContentSource {
  reads = 0;

  constructor(private readonly inner: ContentSource) {}

  async read() {
    this.reads += 1;
    return this.inner.read();
  }
}

class RecordingPublisher implements ContentPublisher {
  readonly calls: PublishingRequest[] = [];

  constructor(private readonly resultFor: (request: PublishingRequest) => PublishingResult) {}

  async publish(request: PublishingRequest): Promise<PublishingResult> {
    this.calls.push(request);
    return this.resultFor(request);
  }
}

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

function installNetworkGuard(): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("Operator workflow tests must not make a real network request.");
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

function layoutKinds(serviceState: Awaited<ReturnType<WorkbenchService["load"]>>) {
  return serviceState.draft.layout.map((block) =>
    block.kind === "story" ? `story:${block.story.id}` : `sponsored:${block.offer.id}`,
  );
}

async function withWorkflow(
  run: (service: WorkbenchService, db: ContentDatabase, extras: {
    source: CountingSource;
    mockPublisher: RecordingPublisher;
    realPublisher: RecordingPublisher;
    newsletterPublisher: RecordingNewsletterPublisher;
  }) => Promise<void>,
  options: { fetchStories?: boolean } = {},
): Promise<void> {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "newsletter-workflow-"));
  const databasePath = path.join(temporaryDirectory, "workbench.db");
  const { client, db } = openContentDatabase(databasePath);
  applyContentFoundationMigrations(db);
  const source = new CountingSource(new BenzingaShapedFixtureSource(fixturePath));
  const mockPublisher = new RecordingPublisher((request) => ({
    sourceStoryId: request.story.id,
    provider: MOCK_WORDPRESS_PROVIDER,
    mode: "mock",
    status: "published",
    externalPostId: `mock_wp_${request.story.id}`,
    url: `https://wordpress-fixture.test/posts/mock_wp_${request.story.id}`,
  }));
  const realPublisher = new RecordingPublisher((request) => ({
    sourceStoryId: request.story.id,
    provider: REAL_WORDPRESS_PROVIDER,
    mode: "real",
    status: "published",
    externalPostId: "88421",
    url: "https://example.wordpress.com/2026/09/02/controlled-story/",
  }));
  const newsletterPublisher = new RecordingNewsletterPublisher();
  const service = new WorkbenchService(
    source,
    new ContentRepository(db),
    new WorkbenchRepository(db),
    mockPublisher,
    realPublisher,
    mockEverflowOfferCatalog,
    new MockIterable(),
    newsletterPublisher,
  );
  if (options.fetchStories !== false) {
    await service.fetchLatestStories();
  }

  try {
    await run(service, db, { source, mockPublisher, realPublisher, newsletterPublisher });
  } finally {
    client.close();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

test("clean database starts with zero fetched stories and load does not read the source", async () => {
  const restoreFetch = installNetworkGuard();
  try {
    await withWorkflow(async (service, _db, { source }) => {
      const state = await service.load();

      assert.equal(source.reads, 0);
      assert.equal(state.availableStories.length, 0);
      assert.deepEqual(state.draft.layout, []);
    }, { fetchStories: false });
  } finally {
    restoreFetch();
  }
});

test("fetch loads the fixture stories and repeated fetch is idempotent", async () => {
  await withWorkflow(async (service, _db, { source }) => {
    const first = await service.fetchLatestStories();
    const afterFirst = await service.load();
    const second = await service.fetchLatestStories();
    const afterSecond = await service.load();

    assert.equal(first.fetchedCount, 5);
    assert.equal(first.availableCount, 5);
    assert.equal(afterFirst.availableStories.length, 5);
    assert.equal(second.fetchedCount, 5);
    assert.equal(second.availableCount, 5);
    assert.deepEqual(
      afterSecond.availableStories.map((story) => story.id),
      afterFirst.availableStories.map((story) => story.id),
    );
    assert.equal(source.reads, 2);
  }, { fetchStories: false });
});

test("reload uses persisted fetched stories without automatically reading the source", async () => {
  await withWorkflow(async (service, _db, { source }) => {
    await service.fetchLatestStories();
    const readsAfterFetch = source.reads;
    const firstLoad = await service.load();
    const secondLoad = await service.load();

    assert.equal(source.reads, readsAfterFetch);
    assert.equal(firstLoad.availableStories.length, 5);
    assert.deepEqual(secondLoad.availableStories, firstLoad.availableStories);
  }, { fetchStories: false });
});

test("refresh does not destroy selected or persisted older stories", async () => {
  await withWorkflow(async (service, db) => {
    const olderFeed: ContentFeed = {
      id: "content_feed_older_persisted",
      name: "Older persisted feed",
      sourceKind: "rss",
    };
    const olderStory: Story = {
      id: "story_older_persisted",
      contentFeedId: olderFeed.id,
      title: "Older persisted story",
      summary: "A story that should survive a later fixture refresh.",
      canonicalUrl: "https://fixture.example.test/news/older-persisted-story",
      publishedAt: "2026-08-01T06:00:00.000Z",
    };
    db.insert(contentFeeds).values(olderFeed).run();
    db.insert(stories).values({
      ...olderStory,
      body: null,
      imageUrl: null,
      sourceAuthor: null,
      sourceItemId: null,
    }).run();

    await service.addStory(olderStory.id);
    await service.fetchLatestStories();
    const state = await service.load();

    assert.equal(state.availableStories.some((story) => story.id === olderStory.id), true);
    assert.equal(state.availableStories.length >= 6, true);
    assert.deepEqual(
      state.draft.layout.map((block) => block.kind === "story" ? block.story.id : block.offer.id),
      [olderStory.id],
    );
  }, { fetchStories: false });
});

test("batch story and advertiser add appends in picker and catalog order", async () => {
  await withWorkflow(async (service) => {
    const available = (await service.load()).availableStories.map((story) => story.id);
    await service.addStories([thirdStoryId, firstStoryId, secondStoryId]);
    await service.addOffers([secondOfferId, firstOfferId]);
    const state = await service.load();
    const expectedStoryOrder = available.filter((storyId) =>
      [firstStoryId, secondStoryId, thirdStoryId].includes(storyId),
    );

    assert.deepEqual(
      state.draft.selectedStories.map((story) => story.id),
      expectedStoryOrder,
    );
    assert.deepEqual(
      state.draft.selectedOffers.map((offer) => offer.id),
      [firstOfferId, secondOfferId],
    );
  });
});

test("duplicate story and offer blocks are prevented and remove restores selectability", async () => {
  await withWorkflow(async (service) => {
    await service.addStories([firstStoryId, secondStoryId]);
    await service.addStories([firstStoryId, secondStoryId]);
    await service.addOffers([firstOfferId]);
    await service.addOffers([firstOfferId]);
    const afterDuplicates = await service.load();
    await service.removeStory(firstStoryId);
    await service.removeOffer(firstOfferId);
    await service.addStories([firstStoryId]);
    await service.addOffers([firstOfferId]);
    const afterReadd = await service.load();

    assert.deepEqual(
      afterDuplicates.draft.selectedStories.map((story) => story.id),
      [secondStoryId, firstStoryId],
    );
    assert.deepEqual(
      afterDuplicates.draft.selectedOffers.map((offer) => offer.id),
      [firstOfferId],
    );
    assert.equal(
      afterDuplicates.draft.layout.filter((block) => block.kind === "story" && block.story.id === firstStoryId).length,
      1,
    );
    assert.deepEqual(layoutKinds(afterReadd).filter((key) => key === `story:${firstStoryId}`).length, 1);
    assert.deepEqual(layoutKinds(afterReadd).filter((key) => key === `sponsored:${firstOfferId}`).length, 1);
  });
});

test("mixed story and sponsored ordering persists across reorder and reload", async () => {
  await withWorkflow(async (service) => {
    await service.addStories([firstStoryId, secondStoryId]);
    await service.addOffers([firstOfferId, secondOfferId]);
    const initial = await service.load();
    const keys = initial.draft.layout.map((block) =>
      layoutBlockKey(
        block.kind === "story"
          ? { kind: "story", storyId: block.story.id }
          : { kind: "sponsored", offerId: block.offer.id },
      ),
    );
    const interleaved = [keys[0]!, keys[2]!, keys[1]!, keys[3]!];
    await service.reorderLayout(interleaved);
    const reordered = await service.load();
    const reloaded = await service.load();

    assert.deepEqual(layoutKinds(reordered), interleaved);
    assert.deepEqual(layoutKinds(reloaded), layoutKinds(reordered));
    assert.equal(
      reordered.draft.layout.some((block, index) =>
        block.kind === "story" && reordered.draft.layout[index + 1]?.kind === "sponsored",
      ),
      true,
    );
    assert.equal(
      reordered.draft.layout.some((block, index) =>
        block.kind === "sponsored" && reordered.draft.layout[index + 1]?.kind === "story",
      ),
      true,
    );
  });
});

test("generate requires a story block, uses fixture URLs, and never writes to WordPress", async () => {
  await withWorkflow(async (service, _db, { mockPublisher, realPublisher, newsletterPublisher }) => {
    await service.addOffers([firstOfferId]);
    await assert.rejects(
      service.generateNewsletter(),
      (error: unknown) => error instanceof WorkbenchServiceError && error.code === "STORIES_REQUIRED",
    );

    await service.addStories([firstStoryId, secondStoryId]);
    await service.generateNewsletter();
    const state = await service.load();

    assert.equal(realPublisher.calls.length, 0);
    assert.equal(mockPublisher.calls.length, 0);
    assert.equal(newsletterPublisher.publishCalls.length, 0);
    assert.equal(state.generatedNewsletterIsCurrent, true);
    assert.match(state.generatedNewsletter?.html ?? "", /fixture\.example\.test/);
    assert.doesNotMatch(state.generatedNewsletter?.html ?? "", /wordpress-fixture\.test/);

    await service.generateNewsletter();
    assert.equal(mockPublisher.calls.length, 0);
    assert.equal(realPublisher.calls.length, 0);
    assert.equal(newsletterPublisher.publishCalls.length, 0);
  });
});

test("existing story publishing results do not change generate output", async () => {
  await withWorkflow(async (service, db, { mockPublisher, realPublisher }) => {
    await service.addStory(firstStoryId);
    const draft = (await service.load()).draft;
    db.insert(publishingResults)
      .values({
        draftId: draft.id,
        publicationId: draft.publicationId!,
        storyId: firstStoryId,
        provider: REAL_WORDPRESS_PROVIDER,
        mode: "real",
        status: "published",
        externalPostId: "88421",
        url: "https://example.wordpress.com/2026/09/02/controlled-story/",
        diagnostic: null,
      })
      .run();

    await service.generateNewsletter();
    const state = await service.load();

    assert.equal(realPublisher.calls.length, 0);
    assert.equal(mockPublisher.calls.length, 0);
    assert.doesNotMatch(state.generatedNewsletter?.html ?? "", /example\.wordpress\.com\/2026\/09\/02\/controlled-story/);
    assert.match(state.generatedNewsletter?.html ?? "", /fixture\.example\.test/);
  });
});

test("leading sponsored block does not control subject or preheader", async () => {
  await withWorkflow(async (service) => {
    await service.addOffers([firstOfferId]);
    await service.addStories([secondStoryId, firstStoryId]);
    const state = await service.load();
    await service.reorderLayout([
      `sponsored:${firstOfferId}`,
      `story:${secondStoryId}`,
      `story:${firstStoryId}`,
    ]);
    await service.generateNewsletter();
    const generated = (await service.load()).generatedNewsletter;
    const secondStory = state.availableStories.find((story) => story.id === secondStoryId);

    assert.ok(generated);
    assert.ok(secondStory);
    assert.equal(generated.subject, secondStory.title);
    assert.equal(generated.preheader, secondStory.summary);
    assert.match(generated.html, /Sponsored[\s\S]*Harborline Savings[\s\S]*Northline Retail/);
  });
});

test("same layout is deterministic and a different order changes fingerprint and render", async () => {
  await withWorkflow(async (service) => {
    await service.addStories([firstStoryId, secondStoryId]);
    await service.addOffers([firstOfferId]);
    await service.reorderLayout([
      `story:${firstStoryId}`,
      `sponsored:${firstOfferId}`,
      `story:${secondStoryId}`,
    ]);
    await service.generateNewsletter();
    const first = await service.load();
    await service.generateNewsletter();
    const second = await service.load();
    await service.reorderLayout([
      `story:${secondStoryId}`,
      `sponsored:${firstOfferId}`,
      `story:${firstStoryId}`,
    ]);
    const afterReorder = await service.load();
    await service.generateNewsletter();
    const regenerated = await service.load();

    assert.deepEqual(second.generatedNewsletter, first.generatedNewsletter);
    assert.equal(afterReorder.generatedNewsletterIsCurrent, false);
    assert.notEqual(
      regenerated.generatedNewsletter?.inputFingerprint,
      first.generatedNewsletter?.inputFingerprint,
    );
    assert.notEqual(regenerated.generatedNewsletter?.html, first.generatedNewsletter?.html);
    const firstStoryIndex = first.generatedNewsletter?.html.indexOf("Aurora Grid") ?? -1;
    const reorderedFirstStoryIndex = regenerated.generatedNewsletter?.html.indexOf("Aurora Grid") ?? -1;
    const firstNorthlineIndex = first.generatedNewsletter?.html.indexOf("Northline Retail") ?? -1;
    const reorderedNorthlineIndex = regenerated.generatedNewsletter?.html.indexOf("Northline Retail") ?? -1;
    assert.ok(firstStoryIndex < firstNorthlineIndex);
    assert.ok(reorderedNorthlineIndex < reorderedFirstStoryIndex);
  });
});

test("reorder or add/remove makes generated output stale and blocks approval and staging", async () => {
  await withWorkflow(async (service) => {
    await service.addStories([firstStoryId, secondStoryId]);
    await service.addOffers([firstOfferId]);
    await service.generateNewsletter();
    await service.approveNewsletter();
    await service.reorderLayout([
      `sponsored:${firstOfferId}`,
      `story:${firstStoryId}`,
      `story:${secondStoryId}`,
    ]);
    const afterReorder = await service.load();
    await assert.rejects(
      service.approveNewsletter(),
      (error: unknown) => error instanceof WorkbenchServiceError && error.code === "NEWSLETTER_STALE",
    );
    await assert.rejects(
      service.stageApprovedNewsletter(),
      (error: unknown) => error instanceof WorkbenchServiceError && error.code === "NEWSLETTER_STALE",
    );

    await service.generateNewsletter();
    await service.approveNewsletter();
    await service.addOffer(secondOfferId);
    const afterAdd = await service.load();
    await service.removeStory(secondStoryId);
    const afterRemove = await service.load();

    assert.equal(afterReorder.generatedNewsletterIsCurrent, false);
    assert.equal(afterReorder.approvalIsCurrent, false);
    assert.equal(afterAdd.generatedNewsletterIsCurrent, false);
    assert.equal(afterRemove.generatedNewsletterIsCurrent, false);
  });
});

test("regenerate and approve restores staging eligibility for the new exact snapshot", async () => {
  await withWorkflow(async (service) => {
    await service.addStories([firstStoryId]);
    await service.addOffers([firstOfferId]);
    await service.generateNewsletter();
    await service.approveNewsletter();
    await service.publishApprovedNewsletter();
    const firstReceipt = await service.stageApprovedNewsletter();
    await service.addStory(secondStoryId);
    await service.generateNewsletter();
    await service.approveNewsletter();
    await service.publishApprovedNewsletter();
    const secondReceipt = await service.stageApprovedNewsletter();
    const repeated = await service.stageApprovedNewsletter();
    const state = await service.load();

    assert.equal(firstReceipt.provider, MOCK_ITERABLE_PROVIDER);
    assert.notEqual(secondReceipt.externalDraftId, firstReceipt.externalDraftId);
    assert.deepEqual(repeated, secondReceipt);
    assert.equal(state.approvalIsCurrent, true);
    assert.equal(state.stagingReceipt?.externalDraftId, secondReceipt.externalDraftId);
  });
});

test("no cron, scheduler, real Iterable, or email send exists in the operator workflow", () => {
  const restoreFetch = installNetworkGuard();
  try {
    const roots = ["app", "src"];
    const files = roots.flatMap((root) => collectSourceFiles(path.join(process.cwd(), root)));
    const runtimeSource = readFileSync(path.join(process.cwd(), "src/workbench/runtime.ts"), "utf8");
    const serviceSource = readFileSync(path.join(process.cwd(), "src/workbench/workbench-service.ts"), "utf8");

    assert.doesNotMatch(runtimeSource, /cron|node-cron|BullMQ|setInterval|scheduler/);
    assert.doesNotMatch(serviceSource, /resolveMockWordPressForStoryBlocks/);
    assert.match(serviceSource, /async generateNewsletter/);

    for (const filePath of files) {
      const source = readFileSync(filePath, "utf8");
      assert.doesNotMatch(source, /node-cron|cron\.schedule|BullMQ|Agenda\(/);
      assert.doesNotMatch(
        source,
        /nodemailer|sendgrid|@sendgrid|resend\.emails|ses\.sendEmail|transporter\.sendMail/,
      );
    }
  } finally {
    restoreFetch();
  }
});
