CREATE TABLE `crm_commission_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`service_name` text NOT NULL,
	`applies_to` text NOT NULL,
	`percentage_bps` integer NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_commission_rules_sort` ON `crm_commission_rules` (`sort_order`);