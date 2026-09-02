CREATE TABLE `publications` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`source_kind` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stories` (
	`id` text PRIMARY KEY NOT NULL,
	`publication_id` text NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`canonical_url` text NOT NULL,
	`image_url` text,
	`published_at` text NOT NULL,
	`source_author` text,
	`source_item_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`publication_id`) REFERENCES `publications`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stories_canonical_url_unique` ON `stories` (`canonical_url`);