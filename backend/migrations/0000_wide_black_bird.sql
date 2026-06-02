CREATE TABLE `answers` (
	`id` varchar(36) NOT NULL,
	`session_id` varchar(36) NOT NULL,
	`question_id` varchar(36) NOT NULL,
	`selected_option_id` varchar(36),
	`timestamp` bigint NOT NULL,
	`is_flagged` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `answers_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_session_question` UNIQUE(`session_id`,`question_id`)
);
--> statement-breakpoint
CREATE TABLE `cheat_logs` (
	`id` varchar(36) NOT NULL,
	`session_id` varchar(36) NOT NULL,
	`event_type` varchar(50) NOT NULL,
	`details` text,
	`occurred_at` bigint NOT NULL,
	CONSTRAINT `cheat_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `exam_sessions` (
	`id` varchar(36) NOT NULL,
	`exam_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`start_time` bigint NOT NULL,
	`end_time` bigint NOT NULL,
	`submitted` tinyint NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `exam_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `exams` (
	`id` varchar(36) NOT NULL,
	`title` varchar(200) NOT NULL,
	`duration_minutes` int NOT NULL DEFAULT 30,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `exams_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `options` (
	`id` varchar(36) NOT NULL,
	`question_id` varchar(36) NOT NULL,
	`text` text NOT NULL,
	CONSTRAINT `options_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `questions` (
	`id` varchar(36) NOT NULL,
	`exam_id` varchar(36) NOT NULL,
	`text` text NOT NULL,
	`correct_option_id` varchar(36) NOT NULL,
	`order_index` int NOT NULL DEFAULT 0,
	CONSTRAINT `questions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(36) NOT NULL,
	`nis` varchar(20) NOT NULL,
	`password` varchar(255) NOT NULL,
	`name` varchar(100) NOT NULL,
	`role` enum('student','supervisor','admin') NOT NULL DEFAULT 'student',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_nis_unique` UNIQUE(`nis`)
);
--> statement-breakpoint
ALTER TABLE `answers` ADD CONSTRAINT `answers_session_id_exam_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `exam_sessions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `answers` ADD CONSTRAINT `answers_question_id_questions_id_fk` FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cheat_logs` ADD CONSTRAINT `cheat_logs_session_id_exam_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `exam_sessions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_sessions` ADD CONSTRAINT `exam_sessions_exam_id_exams_id_fk` FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_sessions` ADD CONSTRAINT `exam_sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `options` ADD CONSTRAINT `options_question_id_questions_id_fk` FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `questions` ADD CONSTRAINT `questions_exam_id_exams_id_fk` FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON DELETE cascade ON UPDATE no action;