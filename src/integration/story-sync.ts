import path from "node:path";

import { BenzingaShapedFixtureSource } from "@/src/adapters/rss/benzinga-shaped-rss";
import type { ContentSource } from "@/src/content/content-source";
import type { NormalizedContentBatch } from "@/src/domain/story";
import type { IntegrationDatabase } from "@/src/integration/postgres/database";
import { IntegrationStoryRepository } from "@/src/integration/postgres/story-repository";

export const INTEGRATION_RSS_FIXTURE_PATH = path.join(
  process.cwd(),
  "tests/fixtures/benzinga-shaped-financial-news.xml",
);

export class IntegrationSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntegrationSyncError";
  }
}

export type StorySyncResult = {
  processed: number;
  stored: number;
};

export function validateNormalizedBatch(batch: NormalizedContentBatch): void {
  if (!batch.contentFeed?.id || !batch.contentFeed.name || !batch.contentFeed.sourceKind) {
    throw new IntegrationSyncError("Content feed is incomplete.");
  }

  if (!Array.isArray(batch.stories) || batch.stories.length === 0) {
    throw new IntegrationSyncError("Story batch is empty.");
  }

  const ids = new Set<string>();
  const canonicalUrls = new Set<string>();

  for (const [index, story] of batch.stories.entries()) {
    if (
      !story.id ||
      !story.contentFeedId ||
      !story.title ||
      !story.summary ||
      !story.canonicalUrl ||
      !story.publishedAt
    ) {
      throw new IntegrationSyncError(`Story ${index + 1} is missing a required field.`);
    }

    if (story.contentFeedId !== batch.contentFeed.id) {
      throw new IntegrationSyncError(`Story ${index + 1} does not belong to the content feed.`);
    }

    if (Number.isNaN(new Date(story.publishedAt).valueOf())) {
      throw new IntegrationSyncError(`Story ${index + 1} has an invalid publishedAt.`);
    }

    if (ids.has(story.id)) {
      throw new IntegrationSyncError("Story batch contains duplicate IDs.");
    }

    if (canonicalUrls.has(story.canonicalUrl)) {
      throw new IntegrationSyncError("Story batch contains duplicate canonical URLs.");
    }

    ids.add(story.id);
    canonicalUrls.add(story.canonicalUrl);
  }
}

export async function syncRssStoriesToPostgres(options: {
  db: IntegrationDatabase;
  fixturePath?: string;
  source?: ContentSource;
}): Promise<StorySyncResult> {
  const source =
    options.source ??
    new BenzingaShapedFixtureSource(options.fixturePath ?? INTEGRATION_RSS_FIXTURE_PATH);
  const batch = await source.read();
  validateNormalizedBatch(batch);

  const repository = new IntegrationStoryRepository(options.db);
  await repository.saveNormalizedBatch(batch);

  return {
    processed: batch.stories.length,
    stored: await repository.countStories(),
  };
}
