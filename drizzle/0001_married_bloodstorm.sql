CREATE TABLE `calendar_bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`event_type_id` text NOT NULL,
	`account_id` text,
	`contact_id` text,
	`customer_name` text NOT NULL,
	`customer_email` text NOT NULL,
	`customer_phone` text,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`timezone` text NOT NULL,
	`location_mode` text NOT NULL,
	`meeting_address` text,
	`video_platform` text,
	`video_url` text,
	`status` text DEFAULT 'CONFIRMED' NOT NULL,
	`notes` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`event_type_id`) REFERENCES `calendar_event_types`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `crm_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_id`) REFERENCES `crm_contacts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `calendar_event_types` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`duration_minutes` integer NOT NULL,
	`buffer_before_minutes` integer DEFAULT 0 NOT NULL,
	`buffer_after_minutes` integer DEFAULT 0 NOT NULL,
	`capacity` integer DEFAULT 1 NOT NULL,
	`location_modes` text NOT NULL,
	`video_platforms` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_event_types_slug_unique` ON `calendar_event_types` (`slug`);--> statement-breakpoint
CREATE TABLE `crm_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`domain` text,
	`phone` text,
	`address` text,
	`category` text,
	`owner_email` text,
	`source` text DEFAULT 'MANUAL' NOT NULL,
	`source_prospect_id` text,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `crm_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text,
	`full_name` text NOT NULL,
	`email` text,
	`phone` text,
	`title` text,
	`lifecycle` text DEFAULT 'LEAD' NOT NULL,
	`assigned_rep` text,
	`source` text DEFAULT 'MANUAL' NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `crm_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `crm_opportunities` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`primary_contact_id` text,
	`name` text NOT NULL,
	`stage` text DEFAULT 'NEW LEAD' NOT NULL,
	`value_cents` integer DEFAULT 0 NOT NULL,
	`probability` integer DEFAULT 10 NOT NULL,
	`assigned_rep` text,
	`commission_rate_bps` integer DEFAULT 0 NOT NULL,
	`commission_status` text DEFAULT 'PENDING' NOT NULL,
	`expected_close_date` text,
	`source` text DEFAULT 'MANUAL' NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `crm_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`primary_contact_id`) REFERENCES `crm_contacts`(`id`) ON UPDATE no action ON DELETE no action
);
