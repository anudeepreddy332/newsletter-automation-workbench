export type Publication = {
  id: string;
  name: string;
  sourceKind: "rss";
};

export type Story = {
  id: string;
  publicationId: string;
  title: string;
  summary: string;
  canonicalUrl: string;
  imageUrl?: string;
  publishedAt: string;
  sourceAuthor?: string;
  sourceItemId?: string;
};

export type NormalizedContentBatch = {
  publication: Publication;
  stories: Story[];
};
