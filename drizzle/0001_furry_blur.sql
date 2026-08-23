CREATE INDEX `idx_assignments_api_key_id` ON `account_api_keys` (`api_key_id`);--> statement-breakpoint
CREATE INDEX `idx_audit_created_at` ON `audit_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_actor` ON `audit_events` (`actor_account_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_sessions_account_id` ON `sessions` (`account_id`);--> statement-breakpoint
CREATE INDEX `idx_sessions_expires_at` ON `sessions` (`expires_at`);