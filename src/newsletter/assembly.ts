import type { Offer } from "@/src/domain/offer";
import type {
  NewsletterAssemblyInput,
  NewsletterOfferInput,
  NewsletterStoryInput,
} from "@/src/domain/newsletter";
import type { Story } from "@/src/domain/story";
import type { PublishingResult } from "@/src/publishing/content-publisher";

function resolvedStoryUrl(story: Story, publishingResults: readonly PublishingResult[]): string {
  const published = publishingResults.find(
    (result) => result.sourceStoryId === story.id && result.status === "published",
  );
  return published?.status === "published" ? published.url : story.canonicalUrl;
}

function toStoryInput(
  story: Story,
  publishingResults: readonly PublishingResult[],
): NewsletterStoryInput {
  return {
    title: story.title,
    summary: story.summary,
    body: story.body,
    url: resolvedStoryUrl(story, publishingResults),
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
  stories: readonly Story[],
  offers: readonly Offer[],
  publishingResults: readonly PublishingResult[] = [],
): NewsletterAssemblyInput {
  return {
    stories: stories.map((story) => toStoryInput(story, publishingResults)),
    offers: offers.map(toOfferInput),
  };
}
