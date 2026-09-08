CREATE SCHEMA "click_quality";
--> statement-breakpoint
CREATE TABLE "click_quality"."events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"schema_version" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"http_method" text NOT NULL,
	"recipient_id" text NOT NULL,
	"message_id" text NOT NULL,
	"campaign_id" text,
	"link_id" text NOT NULL,
	"link_position" integer,
	"tracked_link_count" integer,
	"destination_host" text,
	"message_sent_at" timestamp with time zone,
	"user_agent_raw" text,
	"accept_language_present" boolean,
	"accept_header_present" boolean,
	"network_type" text NOT NULL,
	"asn" integer,
	"asn_org" text,
	"js_execution" text NOT NULL,
	"cookie_state" text NOT NULL,
	"referrer_class" text NOT NULL,
	"source" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "click_quality_events_recipient_message_occurred_idx" ON "click_quality"."events" USING btree ("recipient_id","message_id","occurred_at");