import { asc, eq } from "drizzle-orm";

import type { ContentDatabase } from "@/src/db/database";
import { contentFeeds, stories } from "@/src/db/schema";
import type { ContentFeed, Story } from "@/src/domain/story";

export class ContentRepository {
  constructor(private readonly db: ContentDatabase) {}

  saveContentFeed(contentFeed: ContentFeed): void {
    this.db
      .insert(contentFeeds)
      .values(contentFeed)
      .onConflictDoUpdate({
        target: contentFeeds.id,
        set: {
          name: contentFeed.name,
          sourceKind: contentFeed.sourceKind,
        },
      })
      .run();
  }

  saveStories(contentItems: Story[]): void {
    for (const story of contentItems) {
      this.db
        .insert(stories)
        .values({
          ...story,
          body: story.body ?? null,
          imageUrl: story.imageUrl ?? null,
          sourceAuthor: story.sourceAuthor ?? null,
          sourceItemId: story.sourceItemId ?? null,
        })
        .onConflictDoUpdate({
          target: stories.id,
          set: {
            title: story.title,
            summary: story.summary,
            body: story.body ?? null,
            canonicalUrl: story.canonicalUrl,
            imageUrl: story.imageUrl ?? null,
            publishedAt: story.publishedAt,
            sourceAuthor: story.sourceAuthor ?? null,
            sourceItemId: story.sourceItemId ?? null,
          },
        })
        .run();
    }
  }

  listStories(contentFeedId: string): Story[] {
    return this.mapStories(
      this.db
        .select()
        .from(stories)
        .where(eq(stories.contentFeedId, contentFeedId))
        .orderBy(asc(stories.id))
        .all(),
    );
  }

  listAllStories(): Story[] {
    return this.mapStories(
      this.db.select().from(stories).orderBy(asc(stories.id)).all(),
    );
  }

  private mapStories(rows: Array<typeof stories.$inferSelect>): Story[] {
    return rows.map((story) => ({
      id: story.id,
      contentFeedId: story.contentFeedId,
      title: story.title,
      summary: story.summary,
      body: story.body ?? undefined,
      canonicalUrl: story.canonicalUrl,
      imageUrl: story.imageUrl ?? undefined,
      publishedAt: story.publishedAt,
      sourceAuthor: story.sourceAuthor ?? undefined,
      sourceItemId: story.sourceItemId ?? undefined,
    }));
  }
}
