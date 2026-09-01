CREATE TABLE `crm_form_files` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`question_id` text,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`object_key` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `crm_form_submissions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_form_files_submission_id` ON `crm_form_files` (`submission_id`);--> statement-breakpoint
CREATE TABLE `crm_form_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`form_id` text NOT NULL,
	`contact_id` text,
	`respondent_name` text NOT NULL,
	`respondent_email` text NOT NULL,
	`answers_json` text DEFAULT '{}' NOT NULL,
	`signature_name` text,
	`consent_text` text,
	`signer_ip` text,
	`status` text DEFAULT 'SUBMITTED' NOT NULL,
	`submitted_at` text NOT NULL,
	FOREIGN KEY (`form_id`) REFERENCES `crm_forms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_id`) REFERENCES `crm_contacts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_form_submissions_form_id` ON `crm_form_submissions` (`form_id`);--> statement-breakpoint
CREATE INDEX `idx_form_submissions_email` ON `crm_form_submissions` (`respondent_email`);--> statement-breakpoint
CREATE TABLE `crm_forms` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`public_token` text NOT NULL,
	`fields_json` text DEFAULT '[]' NOT NULL,
	`requires_signature` integer DEFAULT 0 NOT NULL,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_forms_public_token_unique` ON `crm_forms` (`public_token`);