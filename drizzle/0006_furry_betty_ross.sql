ALTER TABLE `crm_accounts` ADD `account_manager` text;--> statement-breakpoint
ALTER TABLE `crm_accounts` ADD `sales_director` text;--> statement-breakpoint
ALTER TABLE `crm_accounts` ADD `vp_sales` text;--> statement-breakpoint
ALTER TABLE `crm_opportunities` ADD `payment_status` text DEFAULT 'UNPAID' NOT NULL;--> statement-breakpoint
ALTER TABLE `crm_opportunities` ADD `collected_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `crm_opportunities` ADD `residual_rate_bps` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `crm_opportunities` ADD `residual_months` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `crm_opportunities` ADD `paid_at` text;