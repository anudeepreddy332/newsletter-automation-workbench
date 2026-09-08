CREATE TABLE "click_quality"."classifications" (
	"event_id" text NOT NULL,
	"classifier_version" text NOT NULL,
	"threshold_set_id" text NOT NULL,
	"decision" text NOT NULL,
	"auto_score" integer NOT NULL,
	"human_score" integer NOT NULL,
	"conflict" boolean NOT NULL,
	"reason_codes" text[] NOT NULL,
	"evidence_report" jsonb NOT NULL,
	"classified_at" timestamp with time zone NOT NULL,
	CONSTRAINT "classifications_event_id_classifier_version_threshold_set_id_pk" PRIMARY KEY("event_id","classifier_version","threshold_set_id")
);
--> statement-breakpoint
CREATE TABLE "click_quality"."threshold_sets" (
	"threshold_set_id" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"classifier_version" text NOT NULL,
	"config" jsonb NOT NULL,
	"notes" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "click_quality"."classifications" ADD CONSTRAINT "classifications_event_id_event_features_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "click_quality"."event_features"("event_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "click_quality"."classifications" ADD CONSTRAINT "classifications_threshold_set_id_threshold_sets_threshold_set_id_fk" FOREIGN KEY ("threshold_set_id") REFERENCES "click_quality"."threshold_sets"("threshold_set_id") ON DELETE no action ON UPDATE no action;