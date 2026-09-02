import { createHash } from "node:crypto";

import type {
  ContentPublisher,
  PublishingRequest,
  PublishingResult,
} from "@/src/publishing/content-publisher";

const PROVIDER = "MockWordPress";

type MockWordPressOptions = {
  failForStoryIds?: readonly string[];
};

export class MockWordPress implements ContentPublisher {
  private readonly failForStoryIds: ReadonlySet<string>;

  constructor(options: MockWordPressOptions = {}) {
    this.failForStoryIds = new Set(options.failForStoryIds);
  }

  async publish(request: PublishingRequest): Promise<PublishingResult> {
    if (this.failForStoryIds.has(request.story.id)) {
      return {
        sourceStoryId: request.story.id,
        provider: PROVIDER,
        mode: "mock",
        status: "failed",
        diagnostic: "Mock publishing was configured to fail for this controlled story.",
      };
    }

    const externalPostId = `mock_wp_${this.operationHash(request)}`;
    return {
      sourceStoryId: request.story.id,
      provider: PROVIDER,
      mode: "mock",
      status: "published",
      externalPostId,
      url: `https://wordpress-fixture.test/posts/${externalPostId}`,
    };
  }

  private operationHash(request: PublishingRequest): string {
    return createHash("sha256")
      .update(`${request.draftId}\n${request.publicationId}\n${request.story.id}`)
      .digest("hex")
      .slice(0, 16);
  }
}
