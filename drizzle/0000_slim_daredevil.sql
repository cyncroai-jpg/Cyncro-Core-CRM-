CREATE TABLE `prospects` (
	`id` text PRIMARY KEY NOT NULL,
	`google_place_id` text,
	`business_name` text NOT NULL,
	`category` text DEFAULT 'Business' NOT NULL,
	`address` text NOT NULL,
	`phone` text,
	`normalized_phone` text,
	`website` text,
	`domain` text,
	`rating_x10` integer,
	`review_count` integer DEFAULT 0 NOT NULL,
	`name_address_key` text NOT NULL,
	`opportunity_score` integer,
	`rank_label` text,
	`signals_json` text,
	`reasons_json` text,
	`why_call` text,
	`what_found` text,
	`recommended_solution` text,
	`call_opener` text,
	`next_action` text,
	`assigned_rep` text,
	`notes` text,
	`status` text DEFAULT 'NEW' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`analyzed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prospects_google_place_id_unique` ON `prospects` (`google_place_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `prospects_domain_unique` ON `prospects` (`domain`);--> statement-breakpoint
CREATE UNIQUE INDEX `prospects_phone_unique` ON `prospects` (`normalized_phone`);--> statement-breakpoint
CREATE UNIQUE INDEX `prospects_name_address_unique` ON `prospects` (`name_address_key`);--> statement-breakpoint
CREATE INDEX `prospects_score_idx` ON `prospects` (`opportunity_score`);--> statement-breakpoint
CREATE INDEX `prospects_status_idx` ON `prospects` (`status`);