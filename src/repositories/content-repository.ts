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
    return this.db
      .select({
        id: stories.id,
        contentFeedId: stories.contentFeedId,
        title: stories.title,
        summary: stories.summary,
        body: stories.body,
        canonicalUrl: stories.canonicalUrl,
        imageUrl: stories.imageUrl,
        publishedAt: stories.publishedAt,
        sourceAuthor: stories.sourceAuthor,
        sourceItemId: stories.sourceItemId,
      })
      .from(stories)
      .where(eq(stories.contentFeedId, contentFeedId))
      .orderBy(asc(stories.id))
      .all()
      .map((story) => ({
        ...story,
        body: story.body ?? undefined,
        imageUrl: story.imageUrl ?? undefined,
        sourceAuthor: story.sourceAuthor ?? undefined,
        sourceItemId: story.sourceItemId ?? undefined,
      }));
  }
}
