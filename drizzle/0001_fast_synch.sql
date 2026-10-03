CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text DEFAULT 'New crew' NOT NULL,
	`coins` integer DEFAULT 0 NOT NULL,
	`score` integer DEFAULT 0 NOT NULL,
	`best` integer DEFAULT 0 NOT NULL,
	`flights` integer DEFAULT 0 NOT NULL,
	`wins` integer DEFAULT 0 NOT NULL,
	`served` integer DEFAULT 0 NOT NULL,
	`owned` text DEFAULT '["coral"]' NOT NULL,
	`equipped` text DEFAULT 'coral' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_profiles_score` ON `profiles` (`score`);--> statement-breakpoint
CREATE TABLE `rewards` (
	`profile_id` text NOT NULL,
	`round_id` text NOT NULL,
	`coins` integer NOT NULL,
	`score` integer NOT NULL,
	PRIMARY KEY(`profile_id`, `round_id`)
);
