CREATE TABLE `team_chat_channel_members` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`member_email` text NOT NULL,
	`role` text DEFAULT 'MEMBER' NOT NULL,
	`joined_at` text NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `team_chat_channels`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_chat_channel_members_unique` ON `team_chat_channel_members` (`channel_id`,`member_email`);--> statement-breakpoint
CREATE INDEX `idx_chat_channel_members_email` ON `team_chat_channel_members` (`member_email`);--> statement-breakpoint
CREATE TABLE `team_chat_channels` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'PUBLIC' NOT NULL,
	`description` text,
	`created_by` text NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_chat_channels_type` ON `team_chat_channels` (`type`,`archived`);--> statement-breakpoint
CREATE TABLE `team_chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`author_email` text NOT NULL,
	`author_name` text NOT NULL,
	`body` text NOT NULL,
	`thread_parent_id` text,
	`attachments_json` text DEFAULT '[]' NOT NULL,
	`crm_link_type` text,
	`crm_link_id` text,
	`edited_at` text,
	`deleted_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `team_chat_channels`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_chat_messages_channel_time` ON `team_chat_messages` (`channel_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_chat_messages_thread` ON `team_chat_messages` (`thread_parent_id`);--> statement-breakpoint
CREATE INDEX `idx_chat_messages_author` ON `team_chat_messages` (`author_email`,`created_at`);--> statement-breakpoint
CREATE TABLE `team_chat_reads` (
	`channel_id` text NOT NULL,
	`member_email` text NOT NULL,
	`last_read_at` text NOT NULL,
	PRIMARY KEY(`channel_id`, `member_email`)
);
--> statement-breakpoint
CREATE INDEX `idx_chat_reads_email` ON `team_chat_reads` (`member_email`);