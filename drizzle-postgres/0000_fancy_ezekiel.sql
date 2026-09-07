CREATE TABLE "content_feeds" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"source_kind" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"source_offer_id" text NOT NULL,
	"advertiser_name" text NOT NULL,
	"offer_name" text NOT NULL,
	"status" text NOT NULL,
	"tracking_url" text NOT NULL,
	CONSTRAINT "offers_source_source_offer_id_unique" UNIQUE("source","source_offer_id")
);
--> statement-breakpoint
CREATE TABLE "stories" (
	"id" text PRIMARY KEY NOT NULL,
	"content_feed_id" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"body" text,
	"canonical_url" text NOT NULL,
	"image_url" text,
	"published_at" timestamp with time zone NOT NULL,
	"source_author" text,
	"source_item_id" text,
	CONSTRAINT "stories_canonical_url_unique" UNIQUE("canonical_url")
);
--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_content_feed_id_content_feeds_id_fk" FOREIGN KEY ("content_feed_id") REFERENCES "public"."content_feeds"("id") ON DELETE no action ON UPDATE no action;