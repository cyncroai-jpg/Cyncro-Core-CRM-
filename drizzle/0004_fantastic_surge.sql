CREATE TABLE `crm_pipeline_stages` (
	`id` text PRIMARY KEY NOT NULL,
	`pipeline_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#B51F38' NOT NULL,
	`position` integer NOT NULL,
	`probability` integer DEFAULT 10 NOT NULL,
	`is_won` integer DEFAULT 0 NOT NULL,
	`is_lost` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`pipeline_id`) REFERENCES `crm_pipelines`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `crm_pipelines` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`is_default` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `crm_opportunities` ADD `pipeline_id` text REFERENCES crm_pipelines(id);