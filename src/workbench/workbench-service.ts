import type { ContentSource } from "@/src/content/content-source";
import type { Draft, WorkbenchState } from "@/src/domain/workbench";
import type { ContentFeed } from "@/src/domain/story";
import type { ContentPublisher, PublishingResult } from "@/src/publishing/content-publisher";
import { ContentRepository } from "@/src/repositories/content-repository";
import { WorkbenchRepository } from "@/src/repositories/workbench-repository";
import { INTERNAL_POC_PUBLICATION, POC_PUBLICATIONS } from "@/src/workbench/publications";

export class WorkbenchService {
  constructor(
    private readonly contentSource: ContentSource,
    private readonly contentRepository: ContentRepository,
    private readonly workbenchRepository: WorkbenchRepository,
    private readonly contentPublisher: ContentPublisher,
  ) {}

  async load(): Promise<WorkbenchState> {
    const contentFeed = await this.ensureFixtureContent();
    const draft = this.ensureInternalPublication();
    return {
      publications: this.workbenchRepository.listPublications(),
      availableStories: this.contentRepository.listStories(contentFeed.id),
      draft,
      publishingResults: this.workbenchRepository.listPublishingResults(draft),
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

  async publishSelectedStories(): Promise<PublishingResult[]> {
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

    const results = await Promise.all(
      draft.selectedStories.map(async (story) => {
        const result = await this.contentPublisher.publish({
          draftId: draft.id,
          publicationId: draft.publicationId!,
          story,
        });
        if (result.sourceStoryId !== story.id) {
          throw new WorkbenchServiceError(
            "PUBLISHER_RESULT_MISMATCH",
            "The publisher returned a result for an unexpected story.",
          );
        }
        return result;
      }),
    );
    for (const result of results) {
      this.workbenchRepository.savePublishingResult(draft, result);
    }
    return results;
  }

  private async prepare(): Promise<void> {
    await this.ensureFixtureContent();
    this.ensureInternalPublication();
  }

  private ensureInternalPublication(): Draft {
    this.workbenchRepository.savePublications(POC_PUBLICATIONS);
    const draft = this.workbenchRepository.readActiveDraft();
    if (draft.publicationId === INTERNAL_POC_PUBLICATION.id) {
      return draft;
    }

    this.workbenchRepository.selectPublication(INTERNAL_POC_PUBLICATION.id);
    return this.workbenchRepository.readActiveDraft();
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
    readonly code: "PUBLICATION_REQUIRED" | "STORIES_REQUIRED" | "PUBLISHER_RESULT_MISMATCH",
    message: string,
  ) {
    super(message);
    this.name = "WorkbenchServiceError";
  }
}
