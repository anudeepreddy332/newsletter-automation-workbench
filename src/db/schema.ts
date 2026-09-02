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
  body: text("body"),
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
  generatedSubject: text("generated_subject"),
  generatedPreheader: text("generated_preheader"),
  generatedHtml: text("generated_html"),
  generatedPlainText: text("generated_plain_text"),
  generatedInputFingerprint: text("generated_input_fingerprint"),
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

export const draftOffers = sqliteTable(
  "draft_offers",
  {
    draftId: text("draft_id")
      .notNull()
      .references(() => drafts.id, { onDelete: "cascade" }),
    offerId: text("offer_id").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [primaryKey({ columns: [table.draftId, table.offerId] })],
);

export const publishingResults = sqliteTable(
  "publishing_results",
  {
    draftId: text("draft_id")
      .notNull()
      .references(() => drafts.id, { onDelete: "cascade" }),
    publicationId: text("publication_id")
      .notNull()
      .references(() => publications.id),
    storyId: text("story_id")
      .notNull()
      .references(() => stories.id),
    provider: text("provider").notNull(),
    mode: text("mode").notNull(),
    status: text("status").notNull(),
    externalPostId: text("external_post_id"),
    url: text("url"),
    diagnostic: text("diagnostic"),
  },
  (table) => [
    primaryKey({
      columns: [table.draftId, table.publicationId, table.storyId, table.provider, table.mode],
    }),
  ],
);

export const approvedNewsletters = sqliteTable("approved_newsletters", {
  draftId: text("draft_id")
    .primaryKey()
    .references(() => drafts.id, { onDelete: "cascade" }),
  approvalFingerprint: text("approval_fingerprint").notNull(),
  generatedInputFingerprint: text("generated_input_fingerprint").notNull(),
  subject: text("subject").notNull(),
  preheader: text("preheader").notNull(),
  html: text("html").notNull(),
  plainText: text("plain_text").notNull(),
});

export const stagingReceipts = sqliteTable(
  "staging_receipts",
  {
    draftId: text("draft_id")
      .notNull()
      .references(() => drafts.id, { onDelete: "cascade" }),
    approvalFingerprint: text("approval_fingerprint").notNull(),
    provider: text("provider").notNull(),
    status: text("status").notNull(),
    externalDraftId: text("external_draft_id").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.draftId, table.approvalFingerprint, table.provider],
    }),
  ],
);
