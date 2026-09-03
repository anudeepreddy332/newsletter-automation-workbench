CREATE TABLE `draft_offers` (
	`draft_id` text NOT NULL,
	`offer_id` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`draft_id`, `offer_id`),
	FOREIGN KEY (`draft_id`) REFERENCES `drafts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `drafts` ADD `generated_subject` text;--> statement-breakpoint
ALTER TABLE `drafts` ADD `generated_preheader` text;--> statement-breakpoint
ALTER TABLE `drafts` ADD `generated_html` text;--> statement-breakpoint
ALTER TABLE `drafts` ADD `generated_plain_text` text;--> statement-breakpoint
ALTER TABLE `drafts` ADD `generated_input_fingerprint` text;