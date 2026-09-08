CREATE TABLE "click_quality"."event_features" (
	"event_id" text PRIMARY KEY NOT NULL,
	"feature_schema_version" text NOT NULL,
	"extractor_version" text NOT NULL,
	"extracted_at" timestamp with time zone NOT NULL,
	"evidence_quality" text NOT NULL,
	"observed_family_count" integer NOT NULL,
	"feature_vector" jsonb NOT NULL,
	"feature_status" jsonb NOT NULL,
	"feature_vector_hash" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "click_quality"."event_features" ADD CONSTRAINT "event_features_event_id_events_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "click_quality"."events"("event_id") ON DELETE no action ON UPDATE no action;