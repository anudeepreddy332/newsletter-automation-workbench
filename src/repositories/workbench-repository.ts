import { and, asc, eq } from "drizzle-orm";

import type { ContentDatabase } from "@/src/db/database";
import {
  draftOffers,
  draftStories,
  drafts,
  publications,
  publishingResults,
  stories,
} from "@/src/db/schema";
import type { GeneratedNewsletter } from "@/src/domain/newsletter";
import type { Publication } from "@/src/domain/workbench";
import type { Story } from "@/src/domain/story";
import type { PublishingMode, PublishingResult } from "@/src/publishing/content-publisher";

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

export type StoredDraft = {
  id: string;
  publicationId?: string;
  selectedStories: Story[];
  selectedOfferIds: string[];
};

function asStory(row: typeof stories.$inferSelect): Story {
  return {
    id: row.id,
    contentFeedId: row.contentFeedId,
    title: row.title,
    summary: row.summary,
    body: row.body ?? undefined,
    canonicalUrl: row.canonicalUrl,
    imageUrl: row.imageUrl ?? undefined,
    publishedAt: row.publishedAt,
    sourceAuthor: row.sourceAuthor ?? undefined,
    sourceItemId: row.sourceItemId ?? undefined,
  };
}

function comparePublishingResults(left: PublishingResult, right: PublishingResult): number {
  if (left.mode !== right.mode) {
    return left.mode === "mock" ? -1 : 1;
  }
  return left.provider.localeCompare(right.provider);
}

function asPublishingMode(value: string): PublishingMode {
  if (value === "mock" || value === "real") {
    return value;
  }
  throw new Error("A stored publishing result has an invalid mode.");
}

function asPublishingResult(row: typeof publishingResults.$inferSelect): PublishingResult {
  const mode = asPublishingMode(row.mode);

  if (row.status === "published") {
    if (!row.externalPostId || !row.url) {
      throw new Error("A stored successful publishing result is incomplete.");
    }
    return {
      sourceStoryId: row.storyId,
      provider: row.provider,
      mode,
      status: "published",
      externalPostId: row.externalPostId,
      url: row.url,
    };
  }

  if (row.status === "failed" && row.diagnostic) {
    return {
      sourceStoryId: row.storyId,
      provider: row.provider,
      mode,
      status: "failed",
      diagnostic: row.diagnostic,
    };
  }

  if (row.status === "unknown" && row.diagnostic) {
    return {
      sourceStoryId: row.storyId,
      provider: row.provider,
      mode,
      status: "unknown",
      diagnostic: row.diagnostic,
    };
  }

  throw new Error("A stored publishing result has an invalid status.");
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

  readActiveDraft(): StoredDraft {
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

    const selectedOfferIds = this.db
      .select({ offerId: draftOffers.offerId })
      .from(draftOffers)
      .where(eq(draftOffers.draftId, ACTIVE_DRAFT_ID))
      .orderBy(asc(draftOffers.position), asc(draftOffers.offerId))
      .all()
      .map((row) => row.offerId);

    return {
      id: draft.id,
      publicationId: draft.publicationId ?? undefined,
      selectedStories,
      selectedOfferIds,
    };
  }

  readGeneratedNewsletter(): GeneratedNewsletter | null {
    const draft = this.db
      .select()
      .from(drafts)
      .where(eq(drafts.id, ACTIVE_DRAFT_ID))
      .get();

    if (
      !draft?.generatedSubject ||
      !draft.generatedPreheader ||
      !draft.generatedHtml ||
      !draft.generatedPlainText ||
      !draft.generatedInputFingerprint
    ) {
      return null;
    }

    return {
      subject: draft.generatedSubject,
      preheader: draft.generatedPreheader,
      html: draft.generatedHtml,
      plainText: draft.generatedPlainText,
      inputFingerprint: draft.generatedInputFingerprint,
    };
  }

  saveGeneratedNewsletter(newsletter: GeneratedNewsletter): void {
    this.readActiveDraft();
    this.db
      .update(drafts)
      .set({
        generatedSubject: newsletter.subject,
        generatedPreheader: newsletter.preheader,
        generatedHtml: newsletter.html,
        generatedPlainText: newsletter.plainText,
        generatedInputFingerprint: newsletter.inputFingerprint,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(drafts.id, ACTIVE_DRAFT_ID))
      .run();
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

  addOffer(offerId: string): void {
    const draft = this.readActiveDraft();
    if (draft.selectedOfferIds.includes(offerId)) {
      return;
    }

    this.db.transaction((transaction) => {
      transaction
        .insert(draftOffers)
        .values({
          draftId: ACTIVE_DRAFT_ID,
          offerId,
          position: draft.selectedOfferIds.length,
        })
        .run();
      transaction
        .update(drafts)
        .set({ updatedAt: new Date().toISOString() })
        .where(eq(drafts.id, ACTIVE_DRAFT_ID))
        .run();
    });
  }

  removeOffer(offerId: string): void {
    const draft = this.readActiveDraft();
    const remainingOfferIds = draft.selectedOfferIds.filter((selectedOfferId) => selectedOfferId !== offerId);

    if (remainingOfferIds.length === draft.selectedOfferIds.length) {
      return;
    }

    this.replaceDraftOffers(remainingOfferIds);
  }

  savePublishingResult(draft: StoredDraft, result: PublishingResult): void {
    if (!draft.publicationId) {
      throw new Error("Publishing requires a selected publication.");
    }

    const existing = this.findPublishingResult(
      draft,
      result.sourceStoryId,
      result.provider,
      result.mode,
    );
    if (existing?.status === "published") {
      return;
    }

    const values = {
      draftId: draft.id,
      publicationId: draft.publicationId,
      storyId: result.sourceStoryId,
      provider: result.provider,
      mode: result.mode,
      status: result.status,
      externalPostId: result.status === "published" ? result.externalPostId : null,
      url: result.status === "published" ? result.url : null,
      diagnostic: result.status === "published" ? null : result.diagnostic,
    };

    this.db
      .insert(publishingResults)
      .values(values)
      .onConflictDoUpdate({
        target: [
          publishingResults.draftId,
          publishingResults.publicationId,
          publishingResults.storyId,
          publishingResults.provider,
          publishingResults.mode,
        ],
        set: {
          status: values.status,
          externalPostId: values.externalPostId,
          url: values.url,
          diagnostic: values.diagnostic,
        },
      })
      .run();
  }

  findPublishingResult(
    draft: StoredDraft,
    storyId: string,
    provider: string,
    mode: PublishingMode,
  ): PublishingResult | undefined {
    if (!draft.publicationId) {
      return undefined;
    }

    const row = this.db
      .select()
      .from(publishingResults)
      .where(
        and(
          eq(publishingResults.draftId, draft.id),
          eq(publishingResults.publicationId, draft.publicationId),
          eq(publishingResults.storyId, storyId),
          eq(publishingResults.provider, provider),
          eq(publishingResults.mode, mode),
        ),
      )
      .get();

    return row ? asPublishingResult(row) : undefined;
  }

  listPublishingResults(draft: StoredDraft): PublishingResult[] {
    if (!draft.publicationId) {
      return [];
    }

    const persistedResults = this.db
      .select()
      .from(publishingResults)
      .where(
        and(
          eq(publishingResults.draftId, draft.id),
          eq(publishingResults.publicationId, draft.publicationId),
        ),
      )
      .all()
      .map(asPublishingResult);
    const resultsByStoryId = new Map<string, PublishingResult[]>();
    for (const result of persistedResults) {
      resultsByStoryId.set(result.sourceStoryId, [
        ...(resultsByStoryId.get(result.sourceStoryId) ?? []),
        result,
      ]);
    }

    return draft.selectedStories.flatMap((story) =>
      [...(resultsByStoryId.get(story.id) ?? [])].sort(comparePublishingResults),
    );
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

  private replaceDraftOffers(offerIds: string[]): void {
    this.db.transaction((transaction) => {
      transaction.delete(draftOffers).where(eq(draftOffers.draftId, ACTIVE_DRAFT_ID)).run();
      for (const [position, offerId] of offerIds.entries()) {
        transaction.insert(draftOffers).values({ draftId: ACTIVE_DRAFT_ID, offerId, position }).run();
      }
      transaction
        .update(drafts)
        .set({ updatedAt: new Date().toISOString() })
        .where(eq(drafts.id, ACTIVE_DRAFT_ID))
        .run();
    });
  }
}
