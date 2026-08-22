CREATE TABLE `workspace_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`entity_type` text,
	`entity_id` text,
	`read_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `crm_activities` ADD `assigned_to` text;