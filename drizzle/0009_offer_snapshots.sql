CREATE TABLE `offer_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`source_offer_id` text NOT NULL,
	`advertiser_name` text NOT NULL,
	`offer_name` text NOT NULL,
	`status` text NOT NULL,
	`tracking_url` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `offer_snapshots_source_source_offer_id_unique` ON `offer_snapshots` (`source`,`source_offer_id`);