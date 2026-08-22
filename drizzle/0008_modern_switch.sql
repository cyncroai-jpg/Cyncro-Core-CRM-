CREATE TABLE `workspace_members` (
	`email` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`role` text DEFAULT 'MEMBER' NOT NULL,
	`crm_access` integer DEFAULT 1 NOT NULL,
	`calendar_access` integer DEFAULT 0 NOT NULL,
	`prospecting_access` integer DEFAULT 0 NOT NULL,
	`manage_users` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
