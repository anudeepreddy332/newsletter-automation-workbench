import type { ContentSource } from "@/src/content/content-source";
import type { WorkbenchState } from "@/src/domain/workbench";
import { ContentRepository } from "@/src/repositories/content-repository";
import { WorkbenchRepository } from "@/src/repositories/workbench-repository";
import { POC_PUBLICATIONS } from "@/src/workbench/publications";

export class WorkbenchService {
  constructor(
    private readonly contentSource: ContentSource,
    private readonly contentRepository: ContentRepository,
    private readonly workbenchRepository: WorkbenchRepository,
  ) {}

  async load(): Promise<WorkbenchState> {
    await this.ensureFixtureContent();
    this.workbenchRepository.savePublications(POC_PUBLICATIONS);
    const draft = this.workbenchRepository.readActiveDraft();
    return {
      publications: this.workbenchRepository.listPublications(),
      availableStories: this.contentRepository.listStories(
        "content_feed_benzinga_shaped_fixture",
      ),
      draft,
    };
  }

  async selectPublication(publicationId: string): Promise<void> {
    await this.prepare();
    this.workbenchRepository.selectPublication(publicationId);
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

  private async prepare(): Promise<void> {
    await this.ensureFixtureContent();
    this.workbenchRepository.savePublications(POC_PUBLICATIONS);
  }

  private async ensureFixtureContent(): Promise<void> {
    const batch = await this.contentSource.read();
    this.contentRepository.saveContentFeed(batch.contentFeed);
    this.contentRepository.saveStories(batch.stories);
  }
}
