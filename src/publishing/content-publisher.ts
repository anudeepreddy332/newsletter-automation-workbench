import type { Story } from "@/src/domain/story";

export type PublishingRequest = {
  draftId: string;
  publicationId: string;
  story: Story;
};

export type PublishingSuccess = {
  sourceStoryId: string;
  provider: string;
  mode: "mock" | "real";
  status: "published";
  externalPostId: string;
  url: string;
};

export type PublishingFailure = {
  sourceStoryId: string;
  provider: string;
  mode: "mock" | "real";
  status: "failed";
  diagnostic: string;
};

export type PublishingResult = PublishingSuccess | PublishingFailure;

export interface ContentPublisher {
  publish(request: PublishingRequest): Promise<PublishingResult>;
}
