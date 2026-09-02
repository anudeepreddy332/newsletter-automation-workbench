import { sql } from "drizzle-orm";
import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const contentFeeds = sqliteTable("content_feeds", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sourceKind: text("source_kind").notNull(),
});

export const stories = sqliteTable("stories", {
  id: text("id").primaryKey(),
  contentFeedId: text("content_feed_id")
    .notNull()
    .references(() => contentFeeds.id),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  canonicalUrl: text("canonical_url").notNull().unique(),
  imageUrl: text("image_url"),
  publishedAt: text("published_at").notNull(),
  sourceAuthor: text("source_author"),
  sourceItemId: text("source_item_id"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const publications = sqliteTable("publications", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
});

export const drafts = sqliteTable("drafts", {
  id: text("id").primaryKey(),
  publicationId: text("publication_id").references(() => publications.id),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const draftStories = sqliteTable(
  "draft_stories",
  {
    draftId: text("draft_id")
      .notNull()
      .references(() => drafts.id, { onDelete: "cascade" }),
    storyId: text("story_id")
      .notNull()
      .references(() => stories.id),
    position: integer("position").notNull(),
  },
  (table) => [primaryKey({ columns: [table.draftId, table.storyId] })],
);
