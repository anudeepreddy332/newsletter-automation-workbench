import { sql } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const publications = sqliteTable("publications", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sourceKind: text("source_kind").notNull(),
});

export const stories = sqliteTable("stories", {
  id: text("id").primaryKey(),
  publicationId: text("publication_id")
    .notNull()
    .references(() => publications.id),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  canonicalUrl: text("canonical_url").notNull().unique(),
  imageUrl: text("image_url"),
  publishedAt: text("published_at").notNull(),
  sourceAuthor: text("source_author"),
  sourceItemId: text("source_item_id"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
