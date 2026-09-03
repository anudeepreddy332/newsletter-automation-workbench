import { and, asc, eq } from "drizzle-orm";

import type { ContentDatabase } from "@/src/db/database";
import {
  approvedNewsletters,
  draftBlocks,
  drafts,
  publications,
  publishingResults,
  stagingReceipts,
  stories,
} from "@/src/db/schema";
import type { ApprovedNewsletterSnapshot } from "@/src/domain/approval";
import {
  layoutBlockKey,
  parseBlockKey,
  SPONSORED_BLOCK_KIND,
  STORY_BLOCK_KIND,
  type StoredLayoutBlock,
} from "@/src/domain/layout";
import type { GeneratedNewsletter } from "@/src/domain/newsletter";
import type { Publication } from "@/src/domain/workbench";
import type { Story } from "@/src/domain/story";
import type { PublishingMode, PublishingResult } from "@/src/publishing/content-publisher";
import type { StagingResult } from "@/src/staging/newsletter-stager";

const ACTIVE_DRAFT_ID = "draft_active_poc";

export class WorkbenchRepositoryError extends Error {
  constructor(
    readonly code: "UNKNOWN_PUBLICATION" | "UNKNOWN_STORY" | "INVALID_LAYOUT",
    message: string,
  ) {
    super(message);
    this.name = "WorkbenchRepositoryError";
  }
}

export type StoredDraft = {
  id: string;
  publicationId?: string;
  layout: StoredLayoutBlock[];
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

function asApprovedNewsletter(row: typeof approvedNewsletters.$inferSelect): ApprovedNewsletterSnapshot {
  return {
    draftId: row.draftId,
    approvalFingerprint: row.approvalFingerprint,
    generatedInputFingerprint: row.generatedInputFingerprint,
    subject: row.subject,
    preheader: row.preheader,
    html: row.html,
    plainText: row.plainText,
  };
}

function asStagingResult(row: typeof stagingReceipts.$inferSelect): StagingResult {
  if (row.status !== "staged") {
    throw new Error("A stored staging receipt has an invalid status.");
  }

  return {
    provider: row.provider,
    status: "staged",
    externalDraftId: row.externalDraftId,
    approvalFingerprint: row.approvalFingerprint,
  };
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

function asStoredLayoutBlock(row: typeof draftBlocks.$inferSelect): StoredLayoutBlock {
  if (row.kind === STORY_BLOCK_KIND && row.storyId) {
    return { kind: "story", storyId: row.storyId };
  }
  if (row.kind === SPONSORED_BLOCK_KIND && row.offerId) {
    return { kind: "sponsored", offerId: row.offerId };
  }
  throw new Error("A stored newsletter layout block is incomplete.");
}

function storyIdsInLayout(layout: readonly StoredLayoutBlock[]): string[] {
  return layout
    .filter((block): block is { kind: "story"; storyId: string } => block.kind === "story")
    .map((block) => block.storyId);
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

    const layout = this.db
      .select()
      .from(draftBlocks)
      .where(eq(draftBlocks.draftId, ACTIVE_DRAFT_ID))
      .orderBy(asc(draftBlocks.position), asc(draftBlocks.blockKey))
      .all()
      .map(asStoredLayoutBlock);

    return {
      id: draft.id,
      publicationId: draft.publicationId ?? undefined,
      layout,
    };
  }

  readStory(storyId: string): Story | undefined {
    const row = this.db.select().from(stories).where(eq(stories.id, storyId)).get();
    return row ? asStory(row) : undefined;
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

  readApprovedNewsletter(): ApprovedNewsletterSnapshot | null {
    const row = this.db
      .select()
      .from(approvedNewsletters)
      .where(eq(approvedNewsletters.draftId, ACTIVE_DRAFT_ID))
      .get();

    return row ? asApprovedNewsletter(row) : null;
  }

  saveApprovedNewsletter(snapshot: ApprovedNewsletterSnapshot): void {
    this.readActiveDraft();
    this.db
      .insert(approvedNewsletters)
      .values({
        draftId: snapshot.draftId,
        approvalFingerprint: snapshot.approvalFingerprint,
        generatedInputFingerprint: snapshot.generatedInputFingerprint,
        subject: snapshot.subject,
        preheader: snapshot.preheader,
        html: snapshot.html,
        plainText: snapshot.plainText,
      })
      .onConflictDoUpdate({
        target: approvedNewsletters.draftId,
        set: {
          approvalFingerprint: snapshot.approvalFingerprint,
          generatedInputFingerprint: snapshot.generatedInputFingerprint,
          subject: snapshot.subject,
          preheader: snapshot.preheader,
          html: snapshot.html,
          plainText: snapshot.plainText,
        },
      })
      .run();
  }

  findStagingReceipt(
    draftId: string,
    approvalFingerprint: string,
    provider: string,
  ): StagingResult | undefined {
    const row = this.db
      .select()
      .from(stagingReceipts)
      .where(
        and(
          eq(stagingReceipts.draftId, draftId),
          eq(stagingReceipts.approvalFingerprint, approvalFingerprint),
          eq(stagingReceipts.provider, provider),
        ),
      )
      .get();

    return row ? asStagingResult(row) : undefined;
  }

  saveStagingReceipt(draftId: string, result: StagingResult): StagingResult {
    this.db
      .insert(stagingReceipts)
      .values({
        draftId,
        approvalFingerprint: result.approvalFingerprint,
        provider: result.provider,
        status: result.status,
        externalDraftId: result.externalDraftId,
      })
      .onConflictDoNothing()
      .run();

    return (
      this.findStagingReceipt(draftId, result.approvalFingerprint, result.provider) ?? result
    );
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

  appendBlocks(blocks: readonly StoredLayoutBlock[]): void {
    const draft = this.readActiveDraft();
    const existingKeys = new Set(draft.layout.map(layoutBlockKey));
    const nextLayout = [...draft.layout];
    let changed = false;

    for (const block of blocks) {
      const key = layoutBlockKey(block);
      if (existingKeys.has(key)) {
        continue;
      }
      if (block.kind === "story" && !this.readStory(block.storyId)) {
        throw new WorkbenchRepositoryError("UNKNOWN_STORY", "The selected story does not exist.");
      }
      existingKeys.add(key);
      nextLayout.push(block);
      changed = true;
    }

    if (changed) {
      this.replaceLayout(nextLayout);
    }
  }

  addStory(storyId: string): void {
    this.appendBlocks([{ kind: "story", storyId }]);
  }

  addOffer(offerId: string): void {
    this.appendBlocks([{ kind: "sponsored", offerId }]);
  }

  removeBlock(blockKey: string): void {
    const draft = this.readActiveDraft();
    const remaining = draft.layout.filter((block) => layoutBlockKey(block) !== blockKey);
    if (remaining.length === draft.layout.length) {
      return;
    }
    this.replaceLayout(remaining);
  }

  removeStory(storyId: string): void {
    this.removeBlock(layoutBlockKey({ kind: "story", storyId }));
  }

  removeOffer(offerId: string): void {
    this.removeBlock(layoutBlockKey({ kind: "sponsored", offerId }));
  }

  moveBlock(blockKey: string, direction: "up" | "down"): void {
    const draft = this.readActiveDraft();
    const keys = draft.layout.map(layoutBlockKey);
    const currentIndex = keys.indexOf(blockKey);
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (currentIndex === -1 || targetIndex < 0 || targetIndex >= keys.length) {
      return;
    }

    const nextKeys = [...keys];
    const current = nextKeys[currentIndex];
    const target = nextKeys[targetIndex];
    if (!current || !target) {
      return;
    }
    nextKeys[currentIndex] = target;
    nextKeys[targetIndex] = current;
    this.reorderLayout(nextKeys);
  }

  moveStory(storyId: string, direction: "up" | "down"): void {
    this.moveBlock(layoutBlockKey({ kind: "story", storyId }), direction);
  }

  reorderLayout(blockKeys: readonly string[]): void {
    const draft = this.readActiveDraft();
    const currentKeys = draft.layout.map(layoutBlockKey);
    if (blockKeys.length !== currentKeys.length) {
      throw new WorkbenchRepositoryError(
        "INVALID_LAYOUT",
        "The newsletter layout order must include every current block exactly once.",
      );
    }

    const currentSet = new Set(currentKeys);
    const nextSet = new Set(blockKeys);
    if (currentSet.size !== nextSet.size || currentKeys.some((key) => !nextSet.has(key))) {
      throw new WorkbenchRepositoryError(
        "INVALID_LAYOUT",
        "The newsletter layout order must include every current block exactly once.",
      );
    }

    this.replaceLayout(blockKeys.map((blockKey) => parseBlockKey(blockKey)));
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

    return storyIdsInLayout(draft.layout).flatMap((storyId) =>
      [...(resultsByStoryId.get(storyId) ?? [])].sort(comparePublishingResults),
    );
  }

  private replaceLayout(layout: readonly StoredLayoutBlock[]): void {
    this.db.transaction((transaction) => {
      transaction.delete(draftBlocks).where(eq(draftBlocks.draftId, ACTIVE_DRAFT_ID)).run();
      for (const [position, block] of layout.entries()) {
        transaction
          .insert(draftBlocks)
          .values({
            draftId: ACTIVE_DRAFT_ID,
            blockKey: layoutBlockKey(block),
            position,
            kind: block.kind,
            storyId: block.kind === "story" ? block.storyId : null,
            offerId: block.kind === "sponsored" ? block.offerId : null,
          })
          .run();
      }
      transaction
        .update(drafts)
        .set({ updatedAt: new Date().toISOString() })
        .where(eq(drafts.id, ACTIVE_DRAFT_ID))
        .run();
    });
  }
}
