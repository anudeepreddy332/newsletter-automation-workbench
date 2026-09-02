import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { BenzingaShapedFixtureSource } from "@/src/adapters/rss/benzinga-shaped-rss";
import { openContentDatabase } from "@/src/db/database";
import { applyContentFoundationMigrations } from "@/src/db/migrate";
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
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "newsletter-workbench-"));
  const databasePath = path.join(temporaryDirectory, "workbench.db");
  const { client, db } = openContentDatabase(databasePath);
  applyContentFoundationMigrations(db);
  const service = new WorkbenchService(
    new BenzingaShapedFixtureSource(fixturePath),
    new ContentRepository(db),
    new WorkbenchRepository(db),
  );

  try {
    await run(service);
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
