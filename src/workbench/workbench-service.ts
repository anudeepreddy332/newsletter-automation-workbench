import { MOCK_WORDPRESS_PROVIDER } from "@/src/adapters/publishing/mock-wordpress";
import { REAL_WORDPRESS_PROVIDER } from "@/src/adapters/publishing/real-wordpress";
import { mockEverflowOfferCatalog } from "@/src/adapters/offers/mock-everflow";
import type { ContentSource } from "@/src/content/content-source";
import type { Draft, WorkbenchState } from "@/src/domain/workbench";
import type { OfferCatalog } from "@/src/domain/offer";
import type { ContentFeed } from "@/src/domain/story";
import { buildNewsletterAssemblyInput } from "@/src/newsletter/assembly";
import { fingerprintNewsletterInput } from "@/src/newsletter/fingerprint";
import { renderNewsletter } from "@/src/newsletter/renderer";
import type {
  ContentPublisher,
  PublishingMode,
  PublishingResult,
} from "@/src/publishing/content-publisher";
import { isBlockingPublishingResult } from "@/src/publishing/content-publisher";
import { ContentRepository } from "@/src/repositories/content-repository";
import { WorkbenchRepository, type StoredDraft } from "@/src/repositories/workbench-repository";
import { INTERNAL_POC_PUBLICATION, POC_PUBLICATIONS } from "@/src/workbench/publications";

export class WorkbenchService {
  constructor(
    private readonly contentSource: ContentSource,
    private readonly contentRepository: ContentRepository,
    private readonly workbenchRepository: WorkbenchRepository,
    private readonly mockPublisher: ContentPublisher,
    private readonly realPublisher: ContentPublisher | null = null,
    private readonly offerCatalog: OfferCatalog = mockEverflowOfferCatalog,
  ) {}

  async load(): Promise<WorkbenchState> {
    const contentFeed = await this.ensureFixtureContent();
    const storedDraft = this.ensureInternalPublication();
    const draft = this.hydrateDraft(storedDraft);
    const generatedNewsletter = this.workbenchRepository.readGeneratedNewsletter();
    const publishingResults = this.workbenchRepository.listPublishingResults(storedDraft);
    const inputFingerprint = fingerprintNewsletterInput(
      buildNewsletterAssemblyInput(draft.selectedStories, draft.selectedOffers, publishingResults),
    );
    return {
      publications: this.workbenchRepository.listPublications(),
      availableStories: this.contentRepository.listStories(contentFeed.id),
      availableOffers: [...this.offerCatalog.list()],
      draft,
      publishingResults,
      realWordPressConfigured: this.realPublisher !== null,
      generatedNewsletter,
      generatedNewsletterIsCurrent:
        generatedNewsletter !== null && generatedNewsletter.inputFingerprint === inputFingerprint,
    };
  }

  async addStory(storyId: string): Promise<void> {
    await this.prepare();
    this.workbenchRepository.addStory(storyId);
  }

  async removeStory(storyId: string): Promise<void> {
    await this.prepare();
    this.workbenchRepository.removeStory(storyId);
  }

  async moveStoryUp(storyId: string): Promise<void> {
    await this.prepare();
    this.workbenchRepository.moveStory(storyId, "up");
  }

  async moveStoryDown(storyId: string): Promise<void> {
    await this.prepare();
    this.workbenchRepository.moveStory(storyId, "down");
  }

  async addOffer(offerId: string): Promise<void> {
    await this.prepare();
    if (!this.offerCatalog.get(offerId)) {
      throw new WorkbenchServiceError("UNKNOWN_OFFER", "The selected advertiser offer does not exist.");
    }
    this.workbenchRepository.addOffer(offerId);
  }

  async removeOffer(offerId: string): Promise<void> {
    await this.prepare();
    this.workbenchRepository.removeOffer(offerId);
  }

  async generateNewsletter(): Promise<void> {
    await this.prepare();
    const draft = this.readDraft();
    if (draft.selectedStories.length === 0) {
      throw new WorkbenchServiceError(
        "STORIES_REQUIRED",
        "Select at least one story before generating a newsletter.",
      );
    }

    const publishingResults = this.workbenchRepository.listPublishingResults(
      this.workbenchRepository.readActiveDraft(),
    );
    const input = buildNewsletterAssemblyInput(
      draft.selectedStories,
      draft.selectedOffers,
      publishingResults,
    );
    const rendered = renderNewsletter(input);
    this.workbenchRepository.saveGeneratedNewsletter({
      ...rendered,
      inputFingerprint: fingerprintNewsletterInput(input),
    });
  }

  async publishSelectedStories(mode: PublishingMode = "mock"): Promise<PublishingResult[]> {
    await this.prepare();
    const draft = this.workbenchRepository.readActiveDraft();

    if (!draft.publicationId) {
      throw new WorkbenchServiceError(
        "PUBLICATION_REQUIRED",
        "Select a publication before publishing selected stories.",
      );
    }
    if (draft.selectedStories.length === 0) {
      throw new WorkbenchServiceError(
        "STORIES_REQUIRED",
        "Select at least one story before publishing.",
      );
    }
    if (mode === "real" && draft.selectedStories.length !== 1) {
      throw new WorkbenchServiceError(
        "REAL_SINGLE_STORY_REQUIRED",
        "Real WordPress.com test publishing requires exactly one selected story.",
      );
    }

    const stories = mode === "real" ? draft.selectedStories.slice(0, 1) : draft.selectedStories;
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

  private async prepare(): Promise<void> {
    await this.ensureFixtureContent();
    this.ensureInternalPublication();
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

  private readDraft(): Draft {
    return this.hydrateDraft(this.workbenchRepository.readActiveDraft());
  }

  private hydrateDraft(stored: StoredDraft): Draft {
    return {
      id: stored.id,
      publicationId: stored.publicationId,
      selectedStories: stored.selectedStories,
      selectedOffers: stored.selectedOfferIds.map((offerId) => {
        const offer = this.offerCatalog.get(offerId);
        if (!offer) {
          throw new WorkbenchServiceError(
            "UNKNOWN_OFFER",
            "A stored advertiser offer is no longer in the catalog.",
          );
        }
        return offer;
      }),
    };
  }

  private async ensureFixtureContent(): Promise<ContentFeed> {
    const batch = await this.contentSource.read();
    this.contentRepository.saveContentFeed(batch.contentFeed);
    this.contentRepository.saveStories(batch.stories);
    return batch.contentFeed;
  }
}

export class WorkbenchServiceError extends Error {
  constructor(
    readonly code:
      | "PUBLICATION_REQUIRED"
      | "STORIES_REQUIRED"
      | "PUBLISHER_RESULT_MISMATCH"
      | "REAL_SINGLE_STORY_REQUIRED"
      | "UNKNOWN_OFFER",
    message: string,
  ) {
    super(message);
    this.name = "WorkbenchServiceError";
  }
}
