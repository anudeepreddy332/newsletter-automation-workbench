import { boolean, index, integer, pgSchema, text, timestamp } from "drizzle-orm/pg-core";

export const clickQualitySchema = pgSchema("click_quality");

export const clickQualityEvents = clickQualitySchema.table(
  "events",
  {
    eventId: text("event_id").primaryKey(),
    schemaVersion: text("schema_version").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "string" }).notNull(),
    httpMethod: text("http_method").notNull(),
    recipientId: text("recipient_id").notNull(),
    messageId: text("message_id").notNull(),
    campaignId: text("campaign_id"),
    linkId: text("link_id").notNull(),
    linkPosition: integer("link_position"),
    trackedLinkCount: integer("tracked_link_count"),
    destinationHost: text("destination_host"),
    messageSentAt: timestamp("message_sent_at", { withTimezone: true, mode: "string" }),
    userAgentRaw: text("user_agent_raw"),
    acceptLanguagePresent: boolean("accept_language_present"),
    acceptHeaderPresent: boolean("accept_header_present"),
    networkType: text("network_type").notNull(),
    asn: integer("asn"),
    asnOrg: text("asn_org"),
    jsExecution: text("js_execution").notNull(),
    cookieState: text("cookie_state").notNull(),
    referrerClass: text("referrer_class").notNull(),
    source: text("source").notNull(),
  },
  (table) => [
    index("click_quality_events_recipient_message_occurred_idx").on(
      table.recipientId,
      table.messageId,
      table.occurredAt,
    ),
  ],
);
