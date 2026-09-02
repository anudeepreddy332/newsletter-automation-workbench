import type { Story } from "@/src/domain/story";

export type PublishingMode = "mock" | "real";

export type PublishingRequest = {
  draftId: string;
  publicationId: string;
  story: Story;
};

export type PublishingSuccess = {
  sourceStoryId: string;
  provider: string;
  mode: PublishingMode;
  status: "published";
  externalPostId: string;
  url: string;
};

export type PublishingFailure = {
  sourceStoryId: string;
  provider: string;
  mode: PublishingMode;
  status: "failed";
  diagnostic: string;
};

export type PublishingUnknown = {
  sourceStoryId: string;
  provider: string;
  mode: PublishingMode;
  status: "unknown";
  diagnostic: string;
};

export type PublishingResult = PublishingSuccess | PublishingFailure | PublishingUnknown;

export interface ContentPublisher {
  publish(request: PublishingRequest): Promise<PublishingResult>;
}

export function isBlockingPublishingResult(
  result: PublishingResult | undefined,
): result is Extract<PublishingResult, { status: "published" | "unknown" }> {
  return result?.status === "published" || result?.status === "unknown";
}
