import type { Story } from "@/src/domain/story";

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
};
