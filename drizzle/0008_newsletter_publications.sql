CREATE TABLE `newsletter_publications` (
	`draft_id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`status` text NOT NULL,
	`external_post_id` text,
	`url` text,
	`approval_fingerprint` text NOT NULL,
	`diagnostic` text,
	FOREIGN KEY (`draft_id`) REFERENCES `drafts`(`id`) ON UPDATE no action ON DELETE cascade
);
