import { asc, eq } from "drizzle-orm";

import type { ContentDatabase } from "@/src/db/database";
import { draftStories, drafts, publications, stories } from "@/src/db/schema";
import type { Draft, Publication } from "@/src/domain/workbench";
import type { Story } from "@/src/domain/story";

const ACTIVE_DRAFT_ID = "draft_active_poc";

export class WorkbenchRepositoryError extends Error {
  constructor(
    readonly code: "UNKNOWN_PUBLICATION" | "UNKNOWN_STORY",
    message: string,
  ) {
    super(message);
    this.name = "WorkbenchRepositoryError";
  }
}

function asStory(row: typeof stories.$inferSelect): Story {
  return {
    id: row.id,
    contentFeedId: row.contentFeedId,
    title: row.title,
    summary: row.summary,
    canonicalUrl: row.canonicalUrl,
    imageUrl: row.imageUrl ?? undefined,
    publishedAt: row.publishedAt,
    sourceAuthor: row.sourceAuthor ?? undefined,
    sourceItemId: row.sourceItemId ?? undefined,
  };
}

export class WorkbenchRepository {
  constructor(private readonly db: ContentDatabase) {}

  savePublications(items: readonly Publication[]): void {
    for (const publication of items) {
      this.db
        .insert(publications)
        .values(publication)
        .onConflictDoUpdate({ target: publications.id, set: { name: publication.name } })
        .run();
    }
  }

  listPublications(): Publication[] {
    return this.db.select().from(publications).orderBy(asc(publications.id)).all();
  }

  readActiveDraft(): Draft {
    this.db
      .insert(drafts)
      .values({ id: ACTIVE_DRAFT_ID })
      .onConflictDoNothing()
      .run();

    const draft = this.db
      .select()
      .from(drafts)
      .where(eq(drafts.id, ACTIVE_DRAFT_ID))
      .get();

    if (!draft) {
      throw new Error("The active draft could not be created.");
    }

    const selectedStories = this.db
      .select({ story: stories })
      .from(draftStories)
      .innerJoin(stories, eq(draftStories.storyId, stories.id))
      .where(eq(draftStories.draftId, ACTIVE_DRAFT_ID))
      .orderBy(asc(draftStories.position), asc(stories.id))
      .all()
      .map(({ story }) => asStory(story));

    return {
      id: draft.id,
      publicationId: draft.publicationId ?? undefined,
      selectedStories,
    };
  }

  selectPublication(publicationId: string): void {
    const publication = this.db
      .select({ id: publications.id })
      .from(publications)
      .where(eq(publications.id, publicationId))
      .get();

    if (!publication) {
      throw new WorkbenchRepositoryError(
        "UNKNOWN_PUBLICATION",
        "The selected publication does not exist.",
      );
    }

    this.readActiveDraft();
    this.db
      .update(drafts)
      .set({ publicationId, updatedAt: new Date().toISOString() })
      .where(eq(drafts.id, ACTIVE_DRAFT_ID))
      .run();
  }

  addStory(storyId: string): void {
    const story = this.db.select().from(stories).where(eq(stories.id, storyId)).get();
    if (!story) {
      throw new WorkbenchRepositoryError("UNKNOWN_STORY", "The selected story does not exist.");
    }

    const draft = this.readActiveDraft();
    if (draft.selectedStories.some((selectedStory) => selectedStory.id === storyId)) {
      return;
    }

    this.db.transaction((transaction) => {
      transaction
        .insert(draftStories)
        .values({
          draftId: ACTIVE_DRAFT_ID,
          storyId,
          position: draft.selectedStories.length,
        })
        .run();
      transaction
        .update(drafts)
        .set({ updatedAt: new Date().toISOString() })
        .where(eq(drafts.id, ACTIVE_DRAFT_ID))
        .run();
    });
  }

  removeStory(storyId: string): void {
    const draft = this.readActiveDraft();
    const remainingStoryIds = draft.selectedStories
      .filter((story) => story.id !== storyId)
      .map((story) => story.id);

    if (remainingStoryIds.length === draft.selectedStories.length) {
      return;
    }

    this.replaceDraftStories(remainingStoryIds);
  }

  moveStory(storyId: string, direction: "up" | "down"): void {
    const draft = this.readActiveDraft();
    const storyIds = draft.selectedStories.map((story) => story.id);
    const currentIndex = storyIds.indexOf(storyId);
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (currentIndex === -1 || targetIndex < 0 || targetIndex >= storyIds.length) {
      return;
    }

    const targetStoryId = storyIds[targetIndex];
    if (!targetStoryId) {
      return;
    }
    storyIds[currentIndex] = targetStoryId;
    storyIds[targetIndex] = storyId;
    this.replaceDraftStories(storyIds);
  }

  private replaceDraftStories(storyIds: string[]): void {
    this.db.transaction((transaction) => {
      transaction.delete(draftStories).where(eq(draftStories.draftId, ACTIVE_DRAFT_ID)).run();
      for (const [position, storyId] of storyIds.entries()) {
        transaction.insert(draftStories).values({ draftId: ACTIVE_DRAFT_ID, storyId, position }).run();
      }
      transaction
        .update(drafts)
        .set({ updatedAt: new Date().toISOString() })
        .where(eq(drafts.id, ACTIVE_DRAFT_ID))
        .run();
    });
  }
}
