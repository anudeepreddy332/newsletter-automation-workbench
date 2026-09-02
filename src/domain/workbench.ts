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
};

export type WorkbenchState = {
  publications: Publication[];
  availableStories: Story[];
  draft: Draft;
  publishingResults: PublishingResult[];
  realWordPressConfigured: boolean;
};
