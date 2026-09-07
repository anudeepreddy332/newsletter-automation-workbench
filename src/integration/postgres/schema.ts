import { pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

export const contentFeeds = pgTable("content_feeds", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sourceKind: text("source_kind").notNull(),
});

export const stories = pgTable("stories", {
  id: text("id").primaryKey(),
  contentFeedId: text("content_feed_id")
    .notNull()
    .references(() => contentFeeds.id),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  body: text("body"),
  canonicalUrl: text("canonical_url").notNull().unique(),
  imageUrl: text("image_url"),
  publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" }).notNull(),
  sourceAuthor: text("source_author"),
  sourceItemId: text("source_item_id"),
});

export const offers = pgTable(
  "offers",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull(),
    sourceOfferId: text("source_offer_id").notNull(),
    advertiserName: text("advertiser_name").notNull(),
    offerName: text("offer_name").notNull(),
    status: text("status").notNull(),
    trackingUrl: text("tracking_url").notNull(),
  },
  (table) => [unique("offers_source_source_offer_id_unique").on(table.source, table.sourceOfferId)],
);
