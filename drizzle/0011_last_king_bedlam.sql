CREATE TABLE `calendar_external_events` (
	`booking_id` text PRIMARY KEY NOT NULL,
	`provider` text DEFAULT 'GOOGLE' NOT NULL,
	`external_event_id` text NOT NULL,
	`owner` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `calendar_bookings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `calendar_oauth_connections` (
	`owner` text PRIMARY KEY NOT NULL,
	`provider` text DEFAULT 'GOOGLE' NOT NULL,
	`account_email` text,
	`calendar_id` text DEFAULT 'primary' NOT NULL,
	`access_token` text NOT NULL,
	`refresh_token` text,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `calendar_oauth_states` (
	`state` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL
);
