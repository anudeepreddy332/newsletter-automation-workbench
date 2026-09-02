import type { GeneratedNewsletter } from "@/src/domain/newsletter";
import type { Offer } from "@/src/domain/offer";
import type { Story } from "@/src/domain/story";
import type { PublishingResult } from "@/src/publishing/content-publisher";

export type Publication = {
  id: string;
  name: string;
};

export type Draft = {
  id: string;
  publicationId?: string;
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
};
