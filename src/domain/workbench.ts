import type { ApprovedNewsletterSnapshot } from "@/src/domain/approval";
import type { GeneratedNewsletter } from "@/src/domain/newsletter";
import type { Offer } from "@/src/domain/offer";
import type { Story } from "@/src/domain/story";
import type { PublishingResult } from "@/src/publishing/content-publisher";
import type { NewsletterPublication } from "@/src/publishing/newsletter-publisher";
import type { StagingResult } from "@/src/staging/newsletter-stager";

export type Publication = {
  id: string;
  name: string;
};

export type StoryBlock = {
  kind: "story";
  story: Story;
};

export type SponsoredBlock = {
  kind: "sponsored";
  offer: Offer;
};

export type NewsletterBlock = StoryBlock | SponsoredBlock;

export type FetchStoriesResult = {
  contentFeedId: string;
  fetchedCount: number;
  availableCount: number;
};

export type Draft = {
  id: string;
  publicationId?: string;
  layout: NewsletterBlock[];
  selectedStories: Story[];
  selectedOffers: Offer[];
};

export type WorkbenchState = {
  publications: Publication[];
  availableStories: Story[];
  availableOffers: Offer[];
  draft: Draft;
  publishingResults: PublishingResult[];
  realWordPressConfigured: boolean;
  generatedNewsletter: GeneratedNewsletter | null;
  generatedNewsletterIsCurrent: boolean;
  approvedNewsletter: ApprovedNewsletterSnapshot | null;
  approvalIsCurrent: boolean;
  wordpressConfigured: boolean;
  newsletterPublication: NewsletterPublication | null;
  newsletterPublicationIsCurrent: boolean;
  stagingReceipt: StagingResult | null;
};
