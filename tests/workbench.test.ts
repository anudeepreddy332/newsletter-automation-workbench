import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { eq } from "drizzle-orm";

import { BenzingaShapedFixtureSource } from "@/src/adapters/rss/benzinga-shaped-rss";
import type { ContentSource } from "@/src/content/content-source";
import { openContentDatabase } from "@/src/db/database";
import { applyContentFoundationMigrations } from "@/src/db/migrate";
import type { ContentDatabase } from "@/src/db/database";
import { contentFeeds } from "@/src/db/schema";
import type { ContentFeed, Story } from "@/src/domain/story";
import { ContentRepository } from "@/src/repositories/content-repository";
import {
  WorkbenchRepository,
  WorkbenchRepositoryError,
} from "@/src/repositories/workbench-repository";
import { WorkbenchService } from "@/src/workbench/workbench-service";

const fixturePath = path.join(
  process.cwd(),
  "tests/fixtures/benzinga-shaped-financial-news.xml",
);
const firstStoryId = "story_6c43c8a1944281017858d68b";
const secondStoryId = "story_5c6a67b4a9b7cb360ddc7877";

async function withWorkbench(
  run: (service: WorkbenchService) => Promise<void>,
): Promise<void> {
  await withContentSource(new BenzingaShapedFixtureSource(fixturePath), run);
}

async function withContentSource(
  contentSource: ContentSource,
  run: (service: WorkbenchService, db: ContentDatabase) => Promise<void>,
): Promise<void> {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "newsletter-workbench-"));
  const databasePath = path.join(temporaryDirectory, "workbench.db");
  const { client, db } = openContentDatabase(databasePath);
  applyContentFoundationMigrations(db);
  const service = new WorkbenchService(
    contentSource,
    new ContentRepository(db),
    new WorkbenchRepository(db),
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

test("publication selection persists on the active draft", async () => {
  await withWorkbench(async (service) => {
    await service.selectPublication("publication_market_brief");

    assert.equal((await service.load()).draft.publicationId, "publication_market_brief");
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
  await withWorkbench(async (service) => {
    await assert.rejects(
      service.selectPublication("publication_unknown"),
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
    await service.selectPublication("publication_daily_dispatch");
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
      ["publication_daily_dispatch", "publication_market_brief"],
    );
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
        imageUrl: undefined,
        sourceAuthor: undefined,
        sourceItemId: undefined,
      },
    ]);
  });
});
