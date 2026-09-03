CREATE TABLE `draft_blocks` (
	`draft_id` text NOT NULL,
	`block_key` text NOT NULL,
	`position` integer NOT NULL,
	`kind` text NOT NULL,
	`story_id` text,
	`offer_id` text,
	PRIMARY KEY(`draft_id`, `block_key`),
	FOREIGN KEY (`draft_id`) REFERENCES `drafts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `draft_blocks` (`draft_id`, `block_key`, `position`, `kind`, `story_id`, `offer_id`)
SELECT
	`draft_id`,
	'story:' || `story_id`,
	`position`,
	'story',
	`story_id`,
	NULL
FROM `draft_stories`;
--> statement-breakpoint
INSERT INTO `draft_blocks` (`draft_id`, `block_key`, `position`, `kind`, `story_id`, `offer_id`)
SELECT
	`draft_id`,
	'sponsored:' || `offer_id`,
	(
		SELECT COUNT(*)
		FROM `draft_stories` AS `existing_stories`
		WHERE `existing_stories`.`draft_id` = `draft_offers`.`draft_id`
	) + `position`,
	'sponsored',
	NULL,
	`offer_id`
FROM `draft_offers`;
