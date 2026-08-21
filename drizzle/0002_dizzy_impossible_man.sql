CREATE TABLE `calendar_availability` (
	`id` text PRIMARY KEY NOT NULL,
	`event_type_id` text,
	`weekday` integer NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`timezone` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`event_type_id`) REFERENCES `calendar_event_types`(`id`) ON UPDATE no action ON DELETE no action
);
