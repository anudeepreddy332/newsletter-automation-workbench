export type ContentFeed = {
  id: string;
  name: string;
  sourceKind: "rss";
};

export type Story = {
  id: string;
  contentFeedId: string;
  title: string;
  summary: string;
  canonicalUrl: string;
  imageUrl?: string;
  publishedAt: string;
  sourceAuthor?: string;
  sourceItemId?: string;
};

export type NormalizedContentBatch = {
  contentFeed: ContentFeed;
  stories: Story[];
};
