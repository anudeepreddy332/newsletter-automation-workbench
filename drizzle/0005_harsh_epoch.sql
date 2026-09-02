CREATE TABLE `approved_newsletters` (
	`draft_id` text PRIMARY KEY NOT NULL,
	`approval_fingerprint` text NOT NULL,
	`generated_input_fingerprint` text NOT NULL,
	`subject` text NOT NULL,
	`preheader` text NOT NULL,
	`html` text NOT NULL,
	`plain_text` text NOT NULL,
	FOREIGN KEY (`draft_id`) REFERENCES `drafts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `staging_receipts` (
	`draft_id` text NOT NULL,
	`approval_fingerprint` text NOT NULL,
	`provider` text NOT NULL,
	`status` text NOT NULL,
	`external_draft_id` text NOT NULL,
	PRIMARY KEY(`draft_id`, `approval_fingerprint`, `provider`),
	FOREIGN KEY (`draft_id`) REFERENCES `drafts`(`id`) ON UPDATE no action ON DELETE cascade
);
