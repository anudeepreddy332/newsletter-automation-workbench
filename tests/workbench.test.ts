import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { eq } from "drizzle-orm";

import { storyOptionLabel } from "@/app/story-presentation";
import { BenzingaShapedFixtureSource } from "@/src/adapters/rss/benzinga-shaped-rss";
import { MOCK_WORDPRESS_PROVIDER, MockWordPress } from "@/src/adapters/publishing/mock-wordpress";
import { REAL_WORDPRESS_PROVIDER } from "@/src/adapters/publishing/real-wordpress";
import type { ContentSource } from "@/src/content/content-source";
import { openContentDatabase } from "@/src/db/database";
import { applyContentFoundationMigrations } from "@/src/db/migrate";
import type { ContentDatabase } from "@/src/db/database";
import { contentFeeds, drafts, publications, publishingResults } from "@/src/db/schema";
import type { ContentFeed, Story } from "@/src/domain/story";
import type {
  ContentPublisher,
  PublishingRequest,
  PublishingResult,
} from "@/src/publishing/content-publisher";
import { ContentRepository } from "@/src/repositories/content-repository";
import {
  WorkbenchRepository,
  WorkbenchRepositoryError,
} from "@/src/repositories/workbench-repository";
import { WorkbenchService, WorkbenchServiceError } from "@/src/workbench/workbench-service";
import { INTERNAL_POC_PUBLICATION } from "@/src/workbench/publications";

const fixturePath = path.join(
  process.cwd(),
  "tests/fixtures/benzinga-shaped-financial-news.xml",
);
const firstStoryId = "story_6c43c8a1944281017858d68b";
const secondStoryId = "story_5c6a67b4a9b7cb360ddc7877";
const thirdStoryId = "story_f4144563fa09bd90887c8750";

async function withWorkbench(
  run: (service: WorkbenchService, db: ContentDatabase) => Promise<void>,
): Promise<void> {
  await withContentSource(new BenzingaShapedFixtureSource(fixturePath), run);
}

async function withContentSource(
  contentSource: ContentSource,
  run: (service: WorkbenchService, db: ContentDatabase) => Promise<void>,
  publisher: ContentPublisher = new MockWordPress(),
  realPublisher: ContentPublisher | null = null,
): Promise<void> {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "newsletter-workbench-"));
  const databasePath = path.join(temporaryDirectory, "workbench.db");
  const { client, db } = openContentDatabase(databasePath);
  applyContentFoundationMigrations(db);
  const service = new WorkbenchService(
    contentSource,
    new ContentRepository(db),
    new WorkbenchRepository(db),
    publisher,
    realPublisher,
  );

  try {
    await run(service, db);
  } finally {
    client.close();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

async function selectTwoStories(service: WorkbenchService): Promise<void> {
  await service.addStory(firstStoryId);
  await service.addStory(secondStoryId);
}

test("the neutral internal publication is applied deterministically", async () => {
  await withWorkbench(async (service) => {
    const firstLoad = await service.load();
    const secondLoad = await service.load();

    assert.equal(firstLoad.draft.publicationId, INTERNAL_POC_PUBLICATION.id);
    assert.equal(secondLoad.draft.publicationId, INTERNAL_POC_PUBLICATION.id);
    assert.deepEqual(firstLoad.publications, [INTERNAL_POC_PUBLICATION]);
  });
});

test("story selection persists and duplicate selection leaves one draft entry", async () => {
  await withWorkbench(async (service) => {
    await service.addStory(firstStoryId);
    await service.addStory(firstStoryId);

    assert.deepEqual(
      (await service.load()).draft.selectedStories.map((story) => story.id),
      [firstStoryId],
    );
  });
});

test("stories retain deterministic order-added across reload", async () => {
  await withWorkbench(async (service) => {
    await service.addStory(secondStoryId);
    await service.addStory(thirdStoryId);
    await service.addStory(firstStoryId);

    assert.deepEqual(
      (await service.load()).draft.selectedStories.map((story) => story.id),
      [secondStoryId, thirdStoryId, firstStoryId],
    );
  });
});

test("story removal persists and closes positions without changing remaining order", async () => {
  await withWorkbench(async (service) => {
    await selectTwoStories(service);
    await service.removeStory(firstStoryId);

    assert.deepEqual(
      (await service.load()).draft.selectedStories.map((story) => story.id),
      [secondStoryId],
    );
  });
});

test("moving a selected story up changes its explicit persisted order", async () => {
  await withWorkbench(async (service) => {
    await selectTwoStories(service);
    await service.moveStoryUp(secondStoryId);

    assert.deepEqual(
      (await service.load()).draft.selectedStories.map((story) => story.id),
      [secondStoryId, firstStoryId],
    );
  });
});

test("moving a selected story down changes its explicit persisted order", async () => {
  await withWorkbench(async (service) => {
    await selectTwoStories(service);
    await service.moveStoryDown(firstStoryId);

    assert.deepEqual(
      (await service.load()).draft.selectedStories.map((story) => story.id),
      [secondStoryId, firstStoryId],
    );
  });
});

test("boundary moves do not corrupt persisted ordering", async () => {
  await withWorkbench(async (service) => {
    await selectTwoStories(service);
    await service.moveStoryUp(firstStoryId);
    await service.moveStoryDown(secondStoryId);

    assert.deepEqual(
      (await service.load()).draft.selectedStories.map((story) => story.id),
      [firstStoryId, secondStoryId],
    );
  });
});

test("an unknown publication ID is rejected safely", async () => {
  await withWorkbench(async (service, db) => {
    await service.load();

    assert.throws(
      () => new WorkbenchRepository(db).selectPublication("publication_unknown"),
      (error: unknown) =>
        error instanceof WorkbenchRepositoryError && error.code === "UNKNOWN_PUBLICATION",
    );
  });
});

test("an unknown story ID is rejected safely", async () => {
  await withWorkbench(async (service) => {
    await assert.rejects(
      service.addStory("story_unknown"),
      (error: unknown) => error instanceof WorkbenchRepositoryError && error.code === "UNKNOWN_STORY",
    );
  });
});

test("draft reload returns the same persisted publication and story order", async () => {
  await withWorkbench(async (service) => {
    await selectTwoStories(service);
    await service.moveStoryUp(secondStoryId);
    const expectedDraft = (await service.load()).draft;

    assert.deepEqual((await service.load()).draft, expectedDraft);
  });
});

test("content feeds and publications stay distinct concepts", async () => {
  await withWorkbench(async (service) => {
    const state = await service.load();

    assert.equal(state.availableStories[0]?.contentFeedId, "content_feed_benzinga_shaped_fixture");
    assert.deepEqual(
      state.publications.map((publication) => publication.id),
      [INTERNAL_POC_PUBLICATION.id],
    );
  });
});

test("a legacy local draft is reassigned safely while its prior results remain valid", async () => {
  await withWorkbench(async (service, db) => {
    await service.addStory(firstStoryId);
    const activeDraft = (await service.load()).draft;
    const legacyPublication = {
      id: "publication_daily_dispatch",
      name: "Daily Dispatch",
    };
    db.insert(publications).values(legacyPublication).run();
    db.update(drafts)
      .set({ publicationId: legacyPublication.id })
      .where(eq(drafts.id, activeDraft.id))
      .run();
    db.insert(publishingResults)
      .values({
        draftId: activeDraft.id,
        publicationId: legacyPublication.id,
        storyId: firstStoryId,
        provider: "MockWordPress",
        mode: "mock",
        status: "published",
        externalPostId: "mock_wp_legacy_result",
        url: "https://wordpress-fixture.test/posts/mock_wp_legacy_result",
        diagnostic: null,
      })
      .run();

    const reloaded = await service.load();
    const legacyResult = db.select()
      .from(publishingResults)
      .where(eq(publishingResults.publicationId, legacyPublication.id))
      .get();

    assert.equal(reloaded.draft.publicationId, INTERNAL_POC_PUBLICATION.id);
    assert.deepEqual(reloaded.draft.selectedStories.map((story) => story.id), [firstStoryId]);
    assert.equal(legacyResult?.publicationId, legacyPublication.id);
    assert.deepEqual(
      db.select().from(publications).where(eq(publications.id, legacyPublication.id)).get(),
      legacyPublication,
    );
  });
});

test("the operator UI is vertical with no publication selector or ordering controls", () => {
  const workbenchSource = readFileSync(path.join(process.cwd(), "app/workbench.tsx"), "utf8");
  const storyPickerSource = readFileSync(path.join(process.cwd(), "app/story-picker.tsx"), "utf8");
  const actionsSource = readFileSync(path.join(process.cwd(), "app/actions.ts"), "utf8");

  assert.doesNotMatch(workbenchSource, /publicationId|selectPublication|Save choice/);
  assert.doesNotMatch(workbenchSource, /workflow-overview|panel-step|Choose newsletter/);
  assert.doesNotMatch(workbenchSource, /Daily Dispatch|Market Brief/);
  assert.doesNotMatch(workbenchSource, /moveStoryUp|moveStoryDown|Move .* up|Move .* down/);
  assert.match(workbenchSource, /1\. Choose stories/);
  assert.match(workbenchSource, /Stories added/);
  assert.match(storyPickerSource, /View full story/);
  assert.match(storyPickerSource, /Add to newsletter/);
  assert.match(storyPickerSource, /selectedStory\?\.body/);
  assert.doesNotMatch(storyPickerSource, /— in newsletter|In newsletter/);
  assert.doesNotMatch(storyPickerSource, /<a(?:\s|>)|href=/);
  assert.doesNotMatch(workbenchSource, /Choose advertiser links|Generate newsletter|Iterable|Everflow/);
  assert.match(workbenchSource, /REAL WORDPRESS\.COM TEST SITE/);
  assert.match(workbenchSource, /result\.sourceStoryId === story\.id/);
  assert.doesNotMatch(workbenchSource, /WORDPRESS_ACCESS_TOKEN|name="accessToken"|name="siteId"|type="password"/);
  assert.doesNotMatch(actionsSource, /WORDPRESS_ACCESS_TOKEN|accessToken|siteId/);
  assert.doesNotMatch(actionsSource, /selectPublication/);
});

test("story dropdown labels remain clean after a story is added", async () => {
  await withWorkbench(async (service) => {
    await service.addStory(firstStoryId);
    const state = await service.load();
    const labels = state.availableStories.map(storyOptionLabel);

    assert.equal(labels.length, 5);
    assert.deepEqual(labels, state.availableStories.map((story) => story.title));
    assert.ok(labels.every((label) => !/in newsletter/i.test(label)));
  });
});

test("workbench loads stories from the content feed returned by its source", async () => {
  const alternateContentFeed: ContentFeed = {
    id: "content_feed_controlled_alternate",
    name: "Controlled alternate feed",
    sourceKind: "rss",
  };
  const alternateStory: Story = {
    id: "story_controlled_alternate",
    contentFeedId: alternateContentFeed.id,
    title: "Controlled alternate story",
    summary: "A story returned by the controlled alternate content source.",
    canonicalUrl: "https://fixture.example.test/news/controlled-alternate-story",
    publishedAt: "2026-09-02T06:00:00.000Z",
  };
  const alternateSource: ContentSource = {
    async read() {
      return { contentFeed: alternateContentFeed, stories: [alternateStory] };
    },
  };

  await withContentSource(alternateSource, async (service, db) => {
    const state = await service.load();

    assert.deepEqual(
      db.select().from(contentFeeds).where(eq(contentFeeds.id, alternateContentFeed.id)).get(),
      alternateContentFeed,
    );
    assert.deepEqual(state.availableStories, [
      {
        ...alternateStory,
        body: undefined,
        imageUrl: undefined,
        sourceAuthor: undefined,
        sourceItemId: undefined,
      },
    ]);
  });
});

test("preparation works without operator publication selection", async () => {
  await withWorkbench(async (service) => {
    await service.addStory(firstStoryId);
    const results = await service.publishSelectedStories();
    const reloaded = await service.load();

    assert.deepEqual(results.map((result) => result.sourceStoryId), [firstStoryId]);
    assert.equal(reloaded.draft.publicationId, INTERNAL_POC_PUBLICATION.id);
    assert.deepEqual(reloaded.publishingResults, results);
  });
});

test("publishing requires at least one selected story", async () => {
  await withWorkbench(async (service) => {
    await assert.rejects(
      service.publishSelectedStories(),
      (error: unknown) =>
        error instanceof WorkbenchServiceError && error.code === "STORIES_REQUIRED",
    );
  });
});

test("publishing processes only the stories currently selected on the active draft", async () => {
  await withWorkbench(async (service) => {
    await service.addStory(firstStoryId);

    const results = await service.publishSelectedStories();

    assert.deepEqual(results.map((result) => result.sourceStoryId), [firstStoryId]);
  });
});

test("MockWordPress results persist across reload and repeated publishing creates no duplicates", async () => {
  await withWorkbench(async (service, db) => {
    await selectTwoStories(service);

    const firstRun = await service.publishSelectedStories();
    const secondRun = await service.publishSelectedStories();
    const reloaded = await service.load();
    const persisted = db.select().from(publishingResults).all();

    assert.deepEqual(secondRun, firstRun);
    assert.deepEqual(reloaded.publishingResults, firstRun);
    assert.equal(persisted.length, 2);
    assert.deepEqual(
      persisted.map((result) => ({ provider: result.provider, mode: result.mode })),
      [
        { provider: "MockWordPress", mode: "mock" },
        { provider: "MockWordPress", mode: "mock" },
      ],
    );
  });
});

test("publishing persistence keeps mock and real-mode identities distinct", async () => {
  await withWorkbench(async (service, db) => {
    await service.addStory(firstStoryId);
    await service.publishSelectedStories();
    const draft = (await service.load()).draft;

    db.insert(publishingResults)
      .values({
        draftId: draft.id,
        publicationId: draft.publicationId!,
        storyId: firstStoryId,
        provider: REAL_WORDPRESS_PROVIDER,
        mode: "real",
        status: "published",
        externalPostId: "wp_real_post_fixture",
        url: "https://example.wordpress.com/2026/09/02/controlled-story/",
        diagnostic: null,
      })
      .run();

    const identities = db.select({ provider: publishingResults.provider, mode: publishingResults.mode })
      .from(publishingResults)
      .all()
      .sort((left, right) => left.provider.localeCompare(right.provider));

    assert.deepEqual(
      identities,
      [
        { provider: MOCK_WORDPRESS_PROVIDER, mode: "mock" },
        { provider: REAL_WORDPRESS_PROVIDER, mode: "real" },
      ],
    );
  });
});

class RecordingPublisher implements ContentPublisher {
  readonly calls: PublishingRequest[] = [];

  constructor(private readonly resultFor: (request: PublishingRequest) => PublishingResult) {}

  async publish(request: PublishingRequest): Promise<PublishingResult> {
    this.calls.push(request);
    return this.resultFor(request);
  }
}

test("unconfigured real publishing fails honestly without calling MockWordPress", async () => {
  const mockPublisher = new RecordingPublisher((publishingRequest) => ({
    sourceStoryId: publishingRequest.story.id,
    provider: MOCK_WORDPRESS_PROVIDER,
    mode: "mock",
    status: "published",
    externalPostId: "mock_should_not_be_used",
    url: "https://wordpress-fixture.test/posts/mock_should_not_be_used",
  }));

  await withContentSource(
    new BenzingaShapedFixtureSource(fixturePath),
    async (service) => {
      await service.addStory(firstStoryId);
      const results = await service.publishSelectedStories("real");
      const state = await service.load();

      assert.equal(mockPublisher.calls.length, 0);
      assert.deepEqual(results, [
        {
          sourceStoryId: firstStoryId,
          provider: REAL_WORDPRESS_PROVIDER,
          mode: "real",
          status: "failed",
          diagnostic:
            "Real WordPress.com test publishing is unavailable because server-side credentials are not configured.",
        },
      ]);
      assert.equal(state.realWordPressConfigured, false);
      assert.equal(state.publishingResults[0]?.mode, "real");
      assert.equal(state.publishingResults[0]?.status, "failed");
    },
    mockPublisher,
    null,
  );
});

test("real publishing requires exactly one selected story", async () => {
  const realPublisher = new RecordingPublisher((publishingRequest) => ({
    sourceStoryId: publishingRequest.story.id,
    provider: REAL_WORDPRESS_PROVIDER,
    mode: "real",
    status: "published",
    externalPostId: "88421",
    url: "https://example.wordpress.com/2026/09/02/controlled-story/",
  }));

  await withContentSource(
    new BenzingaShapedFixtureSource(fixturePath),
    async (service) => {
      await selectTwoStories(service);
      await assert.rejects(
        service.publishSelectedStories("real"),
        (error: unknown) =>
          error instanceof WorkbenchServiceError && error.code === "REAL_SINGLE_STORY_REQUIRED",
      );
      assert.equal(realPublisher.calls.length, 0);
    },
    new MockWordPress(),
    realPublisher,
  );
});

test("workbench state can represent both mock and real results for one story", async () => {
  const realPublisher = new RecordingPublisher((publishingRequest) => ({
    sourceStoryId: publishingRequest.story.id,
    provider: REAL_WORDPRESS_PROVIDER,
    mode: "real",
    status: "published",
    externalPostId: "88421",
    url: "https://example.wordpress.com/2026/09/02/controlled-story/",
  }));

  await withContentSource(
    new BenzingaShapedFixtureSource(fixturePath),
    async (service) => {
      await service.addStory(firstStoryId);
      const mockResults = await service.publishSelectedStories("mock");
      const realResults = await service.publishSelectedStories("real");
      const state = await service.load();

      assert.equal(state.realWordPressConfigured, true);
      assert.equal(mockResults[0]?.mode, "mock");
      assert.equal(realResults[0]?.mode, "real");
      assert.equal(state.publishingResults.length, 2);
      assert.deepEqual(
        state.publishingResults.map((result) => ({
          provider: result.provider,
          mode: result.mode,
          status: result.status,
        })),
        [
          { provider: MOCK_WORDPRESS_PROVIDER, mode: "mock", status: "published" },
          { provider: REAL_WORDPRESS_PROVIDER, mode: "real", status: "published" },
        ],
      );
    },
    new MockWordPress(),
    realPublisher,
  );
});

test("an existing successful real result prevents another real POST", async () => {
  const realPublisher = new RecordingPublisher((publishingRequest) => ({
    sourceStoryId: publishingRequest.story.id,
    provider: REAL_WORDPRESS_PROVIDER,
    mode: "real",
    status: "published",
    externalPostId: "88421",
    url: "https://example.wordpress.com/2026/09/02/controlled-story/",
  }));

  await withContentSource(
    new BenzingaShapedFixtureSource(fixturePath),
    async (service) => {
      await service.addStory(firstStoryId);
      const first = await service.publishSelectedStories("real");
      const second = await service.publishSelectedStories("real");
      const reloaded = await service.load();

      assert.equal(realPublisher.calls.length, 1);
      assert.deepEqual(second, first);
      assert.equal(reloaded.publishingResults.filter((result) => result.mode === "real").length, 1);
    },
    new MockWordPress(),
    realPublisher,
  );
});

test("an ambiguous real create outcome does not trigger a blind retry", async () => {
  const realPublisher = new RecordingPublisher((publishingRequest) => ({
    sourceStoryId: publishingRequest.story.id,
    provider: REAL_WORDPRESS_PROVIDER,
    mode: "real",
    status: "unknown",
    diagnostic:
      "A network error prevented confirming whether the WordPress.com post was created.",
  }));

  await withContentSource(
    new BenzingaShapedFixtureSource(fixturePath),
    async (service) => {
      await service.addStory(firstStoryId);
      const first = await service.publishSelectedStories("real");
      const second = await service.publishSelectedStories("real");

      assert.equal(realPublisher.calls.length, 1);
      assert.equal(first[0]?.status, "unknown");
      assert.deepEqual(second, first);
    },
    new MockWordPress(),
    realPublisher,
  );
});

test("runtime wiring never exposes WordPress credentials to the client module graph", () => {
  const runtimeSource = readFileSync(path.join(process.cwd(), "src/workbench/runtime.ts"), "utf8");
  const actionsSource = readFileSync(path.join(process.cwd(), "app/actions.ts"), "utf8");
  const workbenchSource = readFileSync(path.join(process.cwd(), "app/workbench.tsx"), "utf8");

  assert.doesNotMatch(runtimeSource, /NEXT_PUBLIC_WORDPRESS/);
  assert.match(runtimeSource, /readRealWordPressConfig/);
  assert.match(runtimeSource, /new MockWordPress\(\)/);
  assert.doesNotMatch(actionsSource, /WORDPRESS_ACCESS_TOKEN|WORDPRESS_SITE_ID/);
  assert.match(workbenchSource, /mode" value="mock"/);
  assert.match(workbenchSource, /mode" value="real"/);
});
