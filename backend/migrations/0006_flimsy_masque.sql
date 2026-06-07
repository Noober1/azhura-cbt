CREATE TABLE `app_logs` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`stream` varchar(10) NOT NULL,
	`event_type` varchar(40),
	`actor_id` varchar(36),
	`actor_role` varchar(16),
	`message` varchar(512) NOT NULL,
	`fields` json,
	`created_at` bigint NOT NULL,
	CONSTRAINT `app_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_app_logs_created_at` ON `app_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_app_logs_stream` ON `app_logs` (`stream`);--> statement-breakpoint
CREATE INDEX `idx_app_logs_event_type` ON `app_logs` (`event_type`);