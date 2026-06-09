CREATE TABLE `media` (
	`id` varchar(36) NOT NULL,
	`filename` varchar(255) NOT NULL,
	`original_name` varchar(255) NOT NULL,
	`type` enum('image','audio','video') NOT NULL,
	`mime_type` varchar(100) NOT NULL,
	`size_bytes` int NOT NULL,
	`url` varchar(500) NOT NULL,
	`uploaded_by` varchar(36),
	`created_at` bigint NOT NULL,
	CONSTRAINT `media_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `media` ADD CONSTRAINT `media_uploaded_by_users_id_fk` FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_media_type` ON `media` (`type`);--> statement-breakpoint
CREATE INDEX `idx_media_created_at` ON `media` (`created_at`);