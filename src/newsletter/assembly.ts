import type { Offer } from "@/src/domain/offer";
import type { NewsletterBlock } from "@/src/domain/workbench";
import type {
  NewsletterAssemblyInput,
  NewsletterOfferInput,
  NewsletterStoryInput,
} from "@/src/domain/newsletter";
import type { Story } from "@/src/domain/story";
import type { PublishingMode, PublishingResult } from "@/src/publishing/content-publisher";

function publishedUrlForMode(
  storyId: string,
  publishingResults: readonly PublishingResult[],
  mode: PublishingMode,
): string | undefined {
  for (const result of publishingResults) {
    if (result.sourceStoryId === storyId && result.mode === mode && result.status === "published") {
      return result.url;
    }
  }
  return undefined;
}

export function hasUsablePublishedUrl(
  storyId: string,
  publishingResults: readonly PublishingResult[] = [],
): boolean {
  return publishingResults.some(
    (result) => result.sourceStoryId === storyId && result.status === "published",
  );
}

export function resolveNewsletterStoryUrl(
  story: Story,
  publishingResults: readonly PublishingResult[] = [],
): string {
  return (
    publishedUrlForMode(story.id, publishingResults, "real") ??
    publishedUrlForMode(story.id, publishingResults, "mock") ??
    story.canonicalUrl
  );
}

function toStoryInput(
  story: Story,
  publishingResults: readonly PublishingResult[],
): NewsletterStoryInput {
  return {
    title: story.title,
    summary: story.summary,
    body: story.body,
    url: resolveNewsletterStoryUrl(story, publishingResults),
  };
}

function toOfferInput(offer: Offer): NewsletterOfferInput {
  return {
    advertiserName: offer.advertiserName,
    offerName: offer.offerName,
    trackingUrl: offer.trackingUrl,
  };
}

export function buildNewsletterAssemblyInput(
  layout: readonly NewsletterBlock[],
  publishingResults: readonly PublishingResult[] = [],
): NewsletterAssemblyInput {
  return {
    blocks: layout.map((block) =>
      block.kind === "story"
        ? { kind: "story", story: toStoryInput(block.story, publishingResults) }
        : { kind: "sponsored", offer: toOfferInput(block.offer) },
    ),
  };
}
