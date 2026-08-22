CREATE TABLE `crm_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_id` text NOT NULL,
	`activity_type` text NOT NULL,
	`title` text NOT NULL,
	`details` text,
	`due_at` text,
	`status` text DEFAULT 'COMPLETED' NOT NULL,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `crm_contacts`(`id`) ON UPDATE no action ON DELETE no action
);
