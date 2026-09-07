import { asc, eq } from "drizzle-orm";

import type { NormalizedContentBatch, Story } from "@/src/domain/story";
import type { IntegrationDatabase } from "@/src/integration/postgres/database";
import { contentFeeds, stories } from "@/src/integration/postgres/schema";

export class IntegrationStoryIdentityConflictError extends Error {
  readonly canonicalUrl: string;
  readonly existingId: string;
  readonly incomingId: string;

  constructor(canonicalUrl: string, existingId: string, incomingId: string) {
    super(
      `Story identity conflict: canonical URL already belongs to ${existingId}, incoming id is ${incomingId}. The batch was not saved.`,
    );
    this.name = "IntegrationStoryIdentityConflictError";
    this.canonicalUrl = canonicalUrl;
    this.existingId = existingId;
    this.incomingId = incomingId;
  }
}

type StoryRow = typeof stories.$inferInsert;

function toStoryRow(story: Story): StoryRow {
  return {
    id: story.id,
    contentFeedId: story.contentFeedId,
    title: story.title,
    summary: story.summary,
    body: story.body ?? null,
    canonicalUrl: story.canonicalUrl,
    imageUrl: story.imageUrl ?? null,
    publishedAt: new Date(story.publishedAt),
    sourceAuthor: story.sourceAuthor ?? null,
    sourceItemId: story.sourceItemId ?? null,
  };
}

function toStory(row: typeof stories.$inferSelect): Story {
  return {
    id: row.id,
    contentFeedId: row.contentFeedId,
    title: row.title,
    summary: row.summary,
    body: row.body ?? undefined,
    canonicalUrl: row.canonicalUrl,
    imageUrl: row.imageUrl ?? undefined,
    publishedAt: row.publishedAt.toISOString(),
    sourceAuthor: row.sourceAuthor ?? undefined,
    sourceItemId: row.sourceItemId ?? undefined,
  };
}

export class IntegrationStoryRepository {
  constructor(private readonly db: IntegrationDatabase) {}

  async saveNormalizedBatch(batch: NormalizedContentBatch): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .insert(contentFeeds)
        .values({
          id: batch.contentFeed.id,
          name: batch.contentFeed.name,
          sourceKind: batch.contentFeed.sourceKind,
        })
        .onConflictDoUpdate({
          target: contentFeeds.id,
          set: {
            name: batch.contentFeed.name,
            sourceKind: batch.contentFeed.sourceKind,
          },
        });

      for (const story of batch.stories) {
        const [existing] = await tx
          .select({ id: stories.id })
          .from(stories)
          .where(eq(stories.canonicalUrl, story.canonicalUrl))
          .limit(1);

        if (existing && existing.id !== story.id) {
          throw new IntegrationStoryIdentityConflictError(
            story.canonicalUrl,
            existing.id,
            story.id,
          );
        }

        const row = toStoryRow(story);
        await tx
          .insert(stories)
          .values(row)
          .onConflictDoUpdate({
            target: stories.id,
            set: {
              contentFeedId: row.contentFeedId,
              title: row.title,
              summary: row.summary,
              body: row.body,
              canonicalUrl: row.canonicalUrl,
              imageUrl: row.imageUrl,
              publishedAt: row.publishedAt,
              sourceAuthor: row.sourceAuthor,
              sourceItemId: row.sourceItemId,
            },
          });
      }
    });
  }

  async countStories(): Promise<number> {
    const rows = await this.db.select({ id: stories.id }).from(stories);
    return rows.length;
  }

  async listStories(): Promise<Story[]> {
    const rows = await this.db.select().from(stories).orderBy(asc(stories.id));
    return rows.map(toStory);
  }
}
