CREATE TABLE `publishing_results` (
	`draft_id` text NOT NULL,
	`publication_id` text NOT NULL,
	`story_id` text NOT NULL,
	`provider` text NOT NULL,
	`mode` text NOT NULL,
	`status` text NOT NULL,
	`external_post_id` text,
	`url` text,
	`diagnostic` text,
	PRIMARY KEY(`draft_id`, `publication_id`, `story_id`, `provider`, `mode`),
	FOREIGN KEY (`draft_id`) REFERENCES `drafts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`publication_id`) REFERENCES `publications`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE no action
);
