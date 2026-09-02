import { asc, eq } from "drizzle-orm";

import type { ContentDatabase } from "@/src/db/database";
import { publications, stories } from "@/src/db/schema";
import type { Publication, Story } from "@/src/domain/story";

export class ContentRepository {
  constructor(private readonly db: ContentDatabase) {}

  savePublication(publication: Publication): void {
    this.db
      .insert(publications)
      .values(publication)
      .onConflictDoUpdate({
        target: publications.id,
        set: {
          name: publication.name,
          sourceKind: publication.sourceKind,
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
          imageUrl: story.imageUrl ?? null,
          sourceAuthor: story.sourceAuthor ?? null,
          sourceItemId: story.sourceItemId ?? null,
        })
        .onConflictDoUpdate({
          target: stories.id,
          set: {
            title: story.title,
            summary: story.summary,
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

  listStories(publicationId: string): Story[] {
    return this.db
      .select({
        id: stories.id,
        publicationId: stories.publicationId,
        title: stories.title,
        summary: stories.summary,
        canonicalUrl: stories.canonicalUrl,
        imageUrl: stories.imageUrl,
        publishedAt: stories.publishedAt,
        sourceAuthor: stories.sourceAuthor,
        sourceItemId: stories.sourceItemId,
      })
      .from(stories)
      .where(eq(stories.publicationId, publicationId))
      .orderBy(asc(stories.id))
      .all()
      .map((story) => ({
        ...story,
        imageUrl: story.imageUrl ?? undefined,
        sourceAuthor: story.sourceAuthor ?? undefined,
        sourceItemId: story.sourceItemId ?? undefined,
      }));
  }
}
