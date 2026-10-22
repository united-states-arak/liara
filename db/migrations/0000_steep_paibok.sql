CREATE TABLE `check_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`trigger` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`projects_checked` integer DEFAULT 0 NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer
);
--> statement-breakpoint
CREATE TABLE `findings` (
	`id` text PRIMARY KEY NOT NULL,
	`fingerprint` text NOT NULL,
	`rule_id` text NOT NULL,
	`project_name` text NOT NULL,
	`service_name` text,
	`severity` text NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`evidence` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`resolved_at` integer,
	`last_run_id` text,
	FOREIGN KEY (`last_run_id`) REFERENCES `check_runs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `findings_fingerprint_unique` ON `findings` (`fingerprint`);--> statement-breakpoint
CREATE INDEX `findings_status_idx` ON `findings` (`status`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`role` text NOT NULL,
	`ui_message` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `messages_thread_idx` ON `messages` (`thread_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`encrypted` integer DEFAULT false NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `threads` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text,
	`status` text DEFAULT 'regular' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
