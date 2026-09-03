import { MOCK_WORDPRESS_PROVIDER } from "@/src/adapters/publishing/mock-wordpress";
import { REAL_WORDPRESS_PROVIDER } from "@/src/adapters/publishing/real-wordpress";
import { mockEverflowOfferCatalog } from "@/src/adapters/offers/mock-everflow";
import { MockIterable } from "@/src/adapters/staging/mock-iterable";
import type { ContentSource } from "@/src/content/content-source";
import { storyBlockKey, type StoredLayoutBlock } from "@/src/domain/layout";
import type {
  Draft,
  FetchStoriesResult,
  NewsletterBlock,
  WorkbenchState,
} from "@/src/domain/workbench";
import type { OfferCatalog } from "@/src/domain/offer";
import { buildNewsletterAssemblyInput, hasUsablePublishedUrl } from "@/src/newsletter/assembly";
import {
  approvedSnapshotFromGenerated,
  fingerprintNewsletterInput,
  isApprovedSnapshotConsistent,
  isCurrentApproval,
} from "@/src/newsletter/fingerprint";
import { renderNewsletter } from "@/src/newsletter/renderer";
import type {
  ContentPublisher,
  PublishingMode,
  PublishingResult,
} from "@/src/publishing/content-publisher";
import { isBlockingPublishingResult } from "@/src/publishing/content-publisher";
import { ContentRepository } from "@/src/repositories/content-repository";
import {
  WorkbenchRepository,
  WorkbenchRepositoryError,
  type StoredDraft,
} from "@/src/repositories/workbench-repository";
import type { NewsletterStager, StagingResult } from "@/src/staging/newsletter-stager";
import { INTERNAL_POC_PUBLICATION, POC_PUBLICATIONS } from "@/src/workbench/publications";

type NewsletterContext = {
  storedDraft: StoredDraft;
  draft: Draft;
  generatedNewsletter: WorkbenchState["generatedNewsletter"];
  generatedNewsletterIsCurrent: boolean;
  approvedNewsletter: WorkbenchState["approvedNewsletter"];
  approvalIsCurrent: boolean;
  stagingReceipt: StagingResult | null;
};

export class WorkbenchService {
  constructor(
    private readonly contentSource: ContentSource,
    private readonly contentRepository: ContentRepository,
    private readonly workbenchRepository: WorkbenchRepository,
    private readonly mockPublisher: ContentPublisher,
    private readonly realPublisher: ContentPublisher | null = null,
    private readonly offerCatalog: OfferCatalog = mockEverflowOfferCatalog,
    private readonly stager: NewsletterStager = new MockIterable(),
  ) {}

  async load(): Promise<WorkbenchState> {
    const storedDraft = this.ensureInternalPublication();
    const context = this.readNewsletterContext(storedDraft);
    return {
      publications: this.workbenchRepository.listPublications(),
      availableStories: this.contentRepository.listAllStories(),
      availableOffers: [...this.offerCatalog.list()],
      draft: context.draft,
      publishingResults: this.workbenchRepository.listPublishingResults(storedDraft),
      realWordPressConfigured: this.realPublisher !== null,
      generatedNewsletter: context.generatedNewsletter,
      generatedNewsletterIsCurrent: context.generatedNewsletterIsCurrent,
      approvedNewsletter: context.approvedNewsletter,
      approvalIsCurrent: context.approvalIsCurrent,
      stagingReceipt: context.stagingReceipt,
    };
  }

  async fetchLatestStories(): Promise<FetchStoriesResult> {
    this.ensureInternalPublication();
    const batch = await this.contentSource.read();
    this.contentRepository.saveContentFeed(batch.contentFeed);
    this.contentRepository.saveStories(batch.stories);
    return {
      contentFeedId: batch.contentFeed.id,
      fetchedCount: batch.stories.length,
      availableCount: this.contentRepository.listAllStories().length,
    };
  }

  async addStory(storyId: string): Promise<void> {
    await this.addStories([storyId]);
  }

  async addStories(storyIds: readonly string[]): Promise<void> {
    this.ensureInternalPublication();
    const requested = new Set(storyIds);
    const available = this.contentRepository.listAllStories();
    for (const storyId of requested) {
      if (!available.some((story) => story.id === storyId)) {
        throw new WorkbenchRepositoryError("UNKNOWN_STORY", "The selected story does not exist.");
      }
    }

    const alreadySelected = new Set(
      this.workbenchRepository
        .readActiveDraft()
        .layout.filter((block) => block.kind === "story")
        .map((block) => block.storyId),
    );
    const blocks: StoredLayoutBlock[] = available
      .filter((story) => requested.has(story.id) && !alreadySelected.has(story.id))
      .map((story) => ({ kind: "story", storyId: story.id }));
    this.workbenchRepository.appendBlocks(blocks);
  }

  async removeStory(storyId: string): Promise<void> {
    this.ensureInternalPublication();
    this.workbenchRepository.removeStory(storyId);
  }

  async moveStoryUp(storyId: string): Promise<void> {
    await this.moveBlock(storyBlockKey(storyId), "up");
  }

  async moveStoryDown(storyId: string): Promise<void> {
    await this.moveBlock(storyBlockKey(storyId), "down");
  }

  async moveBlock(blockKey: string, direction: "up" | "down"): Promise<void> {
    this.ensureInternalPublication();
    this.workbenchRepository.moveBlock(blockKey, direction);
  }

  async reorderLayout(blockKeys: readonly string[]): Promise<void> {
    this.ensureInternalPublication();
    this.workbenchRepository.reorderLayout(blockKeys);
  }

  async removeBlock(blockKey: string): Promise<void> {
    this.ensureInternalPublication();
    this.workbenchRepository.removeBlock(blockKey);
  }

  async addOffer(offerId: string): Promise<void> {
    await this.addOffers([offerId]);
  }

  async addOffers(offerIds: readonly string[]): Promise<void> {
    this.ensureInternalPublication();
    const requested = new Set(offerIds);
    for (const offerId of requested) {
      if (!this.offerCatalog.get(offerId)) {
        throw new WorkbenchServiceError(
          "UNKNOWN_OFFER",
          "The selected advertiser offer does not exist.",
        );
      }
    }

    const alreadySelected = new Set(
      this.workbenchRepository
        .readActiveDraft()
        .layout.filter((block) => block.kind === "sponsored")
        .map((block) => block.offerId),
    );
    const blocks: StoredLayoutBlock[] = this.offerCatalog
      .list()
      .filter((offer) => requested.has(offer.id) && !alreadySelected.has(offer.id))
      .map((offer) => ({ kind: "sponsored", offerId: offer.id }));
    this.workbenchRepository.appendBlocks(blocks);
  }

  async removeOffer(offerId: string): Promise<void> {
    this.ensureInternalPublication();
    this.workbenchRepository.removeOffer(offerId);
  }

  async generateNewsletter(): Promise<void> {
    this.ensureInternalPublication();
    const storedDraft = this.workbenchRepository.readActiveDraft();
    const draft = this.hydrateDraft(storedDraft);
    if (draft.selectedStories.length === 0) {
      throw new WorkbenchServiceError(
        "STORIES_REQUIRED",
        "Add at least one story block before generating a newsletter.",
      );
    }

    await this.resolveMockWordPressForStoryBlocks(storedDraft, draft);
    const publishingResults = this.workbenchRepository.listPublishingResults(
      this.workbenchRepository.readActiveDraft(),
    );
    const input = buildNewsletterAssemblyInput(draft.layout, publishingResults);
    const rendered = renderNewsletter(input);
    this.workbenchRepository.saveGeneratedNewsletter({
      ...rendered,
      inputFingerprint: fingerprintNewsletterInput(input),
    });
  }

  async approveNewsletter(): Promise<void> {
    this.ensureInternalPublication();
    const context = this.readNewsletterContext();
    if (context.draft.selectedStories.length === 0) {
      throw new WorkbenchServiceError(
        "STORIES_REQUIRED",
        "Add at least one story block before approving a newsletter.",
      );
    }
    if (!context.generatedNewsletter) {
      throw new WorkbenchServiceError(
        "NEWSLETTER_REQUIRED",
        "Generate a newsletter before approving.",
      );
    }
    if (!context.generatedNewsletterIsCurrent) {
      throw new WorkbenchServiceError(
        "NEWSLETTER_STALE",
        "This generated newsletter is out of date. Generate again before approving.",
      );
    }

    this.workbenchRepository.saveApprovedNewsletter(
      approvedSnapshotFromGenerated(context.draft.id, context.generatedNewsletter),
    );
  }

  async stageApprovedNewsletter(): Promise<StagingResult> {
    this.ensureInternalPublication();
    const context = this.readNewsletterContext();
    if (!context.generatedNewsletter) {
      throw new WorkbenchServiceError(
        "NEWSLETTER_REQUIRED",
        "Generate and approve a newsletter before staging.",
      );
    }
    if (!context.generatedNewsletterIsCurrent) {
      throw new WorkbenchServiceError(
        "NEWSLETTER_STALE",
        "This generated newsletter is out of date. Generate, review, and approve again before staging.",
      );
    }
    if (!context.approvedNewsletter) {
      throw new WorkbenchServiceError(
        "APPROVAL_REQUIRED",
        "Approve the current newsletter before staging.",
      );
    }
    if (!isApprovedSnapshotConsistent(context.approvedNewsletter)) {
      throw new WorkbenchServiceError(
        "APPROVAL_MISMATCH",
        "The stored approval does not match the approved newsletter snapshot.",
      );
    }
    if (!context.approvalIsCurrent) {
      throw new WorkbenchServiceError(
        "APPROVAL_STALE",
        "The previous approval no longer matches this newsletter. Review and approve again before staging.",
      );
    }

    const existing = this.workbenchRepository.findStagingReceipt(
      context.approvedNewsletter.draftId,
      context.approvedNewsletter.approvalFingerprint,
      this.stager.provider,
    );
    if (existing) {
      return existing;
    }

    const result = this.stager.stage(context.approvedNewsletter);
    return this.workbenchRepository.saveStagingReceipt(context.approvedNewsletter.draftId, result);
  }

  async publishSelectedStories(mode: PublishingMode = "mock"): Promise<PublishingResult[]> {
    this.ensureInternalPublication();
    const draft = this.workbenchRepository.readActiveDraft();
    const hydrated = this.hydrateDraft(draft);

    if (!draft.publicationId) {
      throw new WorkbenchServiceError(
        "PUBLICATION_REQUIRED",
        "Select a publication before publishing selected stories.",
      );
    }
    if (hydrated.selectedStories.length === 0) {
      throw new WorkbenchServiceError(
        "STORIES_REQUIRED",
        "Select at least one story before publishing.",
      );
    }
    if (mode === "real" && hydrated.selectedStories.length !== 1) {
      throw new WorkbenchServiceError(
        "REAL_SINGLE_STORY_REQUIRED",
        "Real WordPress.com test publishing requires exactly one selected story.",
      );
    }

    const stories = mode === "real" ? hydrated.selectedStories.slice(0, 1) : hydrated.selectedStories;
    const results: PublishingResult[] = [];
    for (const story of stories) {
      const result = await this.publishStory(draft, story, mode);
      if (result.sourceStoryId !== story.id) {
        throw new WorkbenchServiceError(
          "PUBLISHER_RESULT_MISMATCH",
          "The publisher returned a result for an unexpected story.",
        );
      }
      this.workbenchRepository.savePublishingResult(draft, result);
      results.push(this.workbenchRepository.findPublishingResult(
        draft,
        story.id,
        result.provider,
        result.mode,
      ) ?? result);
    }
    return results;
  }

  private async resolveMockWordPressForStoryBlocks(
    storedDraft: StoredDraft,
    draft: Draft,
  ): Promise<void> {
    let publishingResults = this.workbenchRepository.listPublishingResults(storedDraft);
    for (const block of draft.layout) {
      if (block.kind !== "story") {
        continue;
      }
      if (hasUsablePublishedUrl(block.story.id, publishingResults)) {
        continue;
      }

      const result = await this.publishStory(storedDraft, block.story, "mock");
      this.workbenchRepository.savePublishingResult(storedDraft, result);
      publishingResults = this.workbenchRepository.listPublishingResults(storedDraft);
    }
  }

  private async publishStory(
    draft: StoredDraft,
    story: Draft["selectedStories"][number],
    mode: PublishingMode,
  ): Promise<PublishingResult> {
    const provider = mode === "real" ? REAL_WORDPRESS_PROVIDER : MOCK_WORDPRESS_PROVIDER;
    const existing = this.workbenchRepository.findPublishingResult(
      draft,
      story.id,
      provider,
      mode,
    );
    if (mode === "real" && isBlockingPublishingResult(existing)) {
      return existing;
    }

    if (mode === "real" && !this.realPublisher) {
      return {
        sourceStoryId: story.id,
        provider: REAL_WORDPRESS_PROVIDER,
        mode: "real",
        status: "failed",
        diagnostic:
          "Real WordPress.com test publishing is unavailable because server-side credentials are not configured.",
      };
    }

    const publisher = mode === "real" ? this.realPublisher : this.mockPublisher;
    if (!publisher) {
      return {
        sourceStoryId: story.id,
        provider: REAL_WORDPRESS_PROVIDER,
        mode: "real",
        status: "failed",
        diagnostic:
          "Real WordPress.com test publishing is unavailable because server-side credentials are not configured.",
      };
    }

    try {
      return await publisher.publish({
        draftId: draft.id,
        publicationId: draft.publicationId!,
        story,
      });
    } catch (error) {
      if (mode !== "real") {
        throw error;
      }
      return {
        sourceStoryId: story.id,
        provider: REAL_WORDPRESS_PROVIDER,
        mode: "real",
        status: "unknown",
        diagnostic:
          "The WordPress.com request did not complete; the post may or may not have been created.",
      };
    }
  }

  private ensureInternalPublication(): StoredDraft {
    this.workbenchRepository.savePublications(POC_PUBLICATIONS);
    const draft = this.workbenchRepository.readActiveDraft();
    if (draft.publicationId === INTERNAL_POC_PUBLICATION.id) {
      return draft;
    }

    this.workbenchRepository.selectPublication(INTERNAL_POC_PUBLICATION.id);
    return this.workbenchRepository.readActiveDraft();
  }

  private readNewsletterContext(
    storedDraft: StoredDraft = this.workbenchRepository.readActiveDraft(),
  ): NewsletterContext {
    const draft = this.hydrateDraft(storedDraft);
    const generatedNewsletter = this.workbenchRepository.readGeneratedNewsletter();
    const publishingResults = this.workbenchRepository.listPublishingResults(storedDraft);
    const inputFingerprint = fingerprintNewsletterInput(
      buildNewsletterAssemblyInput(draft.layout, publishingResults),
    );
    const generatedNewsletterIsCurrent =
      generatedNewsletter !== null && generatedNewsletter.inputFingerprint === inputFingerprint;
    const approvedNewsletter = this.workbenchRepository.readApprovedNewsletter();
    const approvalIsCurrent = isCurrentApproval(
      generatedNewsletter,
      generatedNewsletterIsCurrent,
      approvedNewsletter,
    );
    const stagingReceipt =
      approvalIsCurrent && approvedNewsletter
        ? this.workbenchRepository.findStagingReceipt(
            approvedNewsletter.draftId,
            approvedNewsletter.approvalFingerprint,
            this.stager.provider,
          ) ?? null
        : null;

    return {
      storedDraft,
      draft,
      generatedNewsletter,
      generatedNewsletterIsCurrent,
      approvedNewsletter,
      approvalIsCurrent,
      stagingReceipt,
    };
  }

  private hydrateDraft(stored: StoredDraft): Draft {
    const layout: NewsletterBlock[] = stored.layout.map((block) => {
      if (block.kind === "story") {
        const story = this.workbenchRepository.readStory(block.storyId);
        if (!story) {
          throw new WorkbenchRepositoryError("UNKNOWN_STORY", "The selected story does not exist.");
        }
        return { kind: "story", story };
      }

      const offer = this.offerCatalog.get(block.offerId);
      if (!offer) {
        throw new WorkbenchServiceError(
          "UNKNOWN_OFFER",
          "A stored advertiser offer is no longer in the catalog.",
        );
      }
      return { kind: "sponsored", offer };
    });

    return {
      id: stored.id,
      publicationId: stored.publicationId,
      layout,
      selectedStories: layout
        .filter((block): block is Extract<NewsletterBlock, { kind: "story" }> => block.kind === "story")
        .map((block) => block.story),
      selectedOffers: layout
        .filter((block): block is Extract<NewsletterBlock, { kind: "sponsored" }> => block.kind === "sponsored")
        .map((block) => block.offer),
    };
  }
}

export class WorkbenchServiceError extends Error {
  constructor(
    readonly code:
      | "PUBLICATION_REQUIRED"
      | "STORIES_REQUIRED"
      | "PUBLISHER_RESULT_MISMATCH"
      | "REAL_SINGLE_STORY_REQUIRED"
      | "UNKNOWN_OFFER"
      | "NEWSLETTER_REQUIRED"
      | "NEWSLETTER_STALE"
      | "APPROVAL_REQUIRED"
      | "APPROVAL_STALE"
      | "APPROVAL_MISMATCH",
    message: string,
  ) {
    super(message);
    this.name = "WorkbenchServiceError";
  }
}
