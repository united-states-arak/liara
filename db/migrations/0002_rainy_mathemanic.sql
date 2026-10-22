CREATE TABLE `folders` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`team_key` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `resource_snapshots` (
	`team_key` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`fetched_at` integer NOT NULL,
	`error` text,
	PRIMARY KEY(`team_key`, `kind`)
);
--> statement-breakpoint
CREATE TABLE `resource_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`team_key` text NOT NULL,
	`kind` text NOT NULL,
	`resource_id` text NOT NULL,
	`name` text NOT NULL,
	`monitored` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `resource_tags_unique` ON `resource_tags` (`team_key`,`kind`,`resource_id`);--> statement-breakpoint
ALTER TABLE `findings` ADD `kind` text DEFAULT 'app' NOT NULL;--> statement-breakpoint
ALTER TABLE `findings` ADD `resource_id` text;--> statement-breakpoint
ALTER TABLE `threads` ADD `team_key` text DEFAULT 'personal' NOT NULL;--> statement-breakpoint
ALTER TABLE `threads` ADD `folder_id` text REFERENCES folders(id);--> statement-breakpoint
CREATE INDEX `threads_team_idx` ON `threads` (`team_key`);