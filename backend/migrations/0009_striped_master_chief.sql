CREATE TABLE `exam_supervisors` (
	`exam_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	CONSTRAINT `exam_supervisors_exam_id_user_id_pk` PRIMARY KEY(`exam_id`,`user_id`)
);
--> statement-breakpoint
ALTER TABLE `questions` MODIFY COLUMN `correct_option_id` varchar(36);--> statement-breakpoint
ALTER TABLE `questions` ADD `type` enum('multiple_choice','fill_in_blank','matching','sorting') DEFAULT 'multiple_choice' NOT NULL;--> statement-breakpoint
ALTER TABLE `questions` ADD `config` json;--> statement-breakpoint
ALTER TABLE `exam_supervisors` ADD CONSTRAINT `exam_supervisors_exam_id_exams_id_fk` FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_supervisors` ADD CONSTRAINT `exam_supervisors_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;