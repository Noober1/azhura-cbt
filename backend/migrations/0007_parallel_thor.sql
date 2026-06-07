CREATE TABLE `chat_messages` (
	`id` varchar(36) NOT NULL,
	`kind` enum('user','system') NOT NULL DEFAULT 'user',
	`user_id` varchar(36),
	`name` varchar(100) NOT NULL,
	`group_name` varchar(30),
	`content` varchar(500) NOT NULL,
	`created_at` bigint NOT NULL,
	CONSTRAINT `chat_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `chat_messages` ADD CONSTRAINT `chat_messages_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_chat_created_at` ON `chat_messages` (`created_at`);--> statement-breakpoint
-- Ensure 4-byte code points (emoji, #17) are storable regardless of the server's
-- default charset; the mysql2 pool also connects with charset=utf8mb4 (db/index.ts).
ALTER TABLE `chat_messages` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;