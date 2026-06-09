ALTER TABLE `answers` ADD COLUMN IF NOT EXISTS `answer_value` text;--> statement-breakpoint
ALTER TABLE `exam_sessions` ADD COLUMN IF NOT EXISTS `paused_at` bigint;--> statement-breakpoint
ALTER TABLE `options` ADD COLUMN IF NOT EXISTS `order_index` int DEFAULT 0 NOT NULL;