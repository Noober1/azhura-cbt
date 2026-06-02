CREATE TABLE `exam_groups` (
	`exam_id` varchar(36) NOT NULL,
	`group_id` varchar(36) NOT NULL,
	CONSTRAINT `exam_groups_exam_id_group_id_pk` PRIMARY KEY(`exam_id`,`group_id`)
);
--> statement-breakpoint
CREATE TABLE `groups` (
	`id` varchar(36) NOT NULL,
	`name` varchar(30) NOT NULL,
	CONSTRAINT `groups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `exams` MODIFY COLUMN `is_active` tinyint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `exams` ADD `token` varchar(5);--> statement-breakpoint
ALTER TABLE `exams` ADD `expired_at` timestamp DEFAULT (now()) NOT NULL;--> statement-breakpoint
ALTER TABLE `exams` ADD `randomize_question` tinyint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `exams` ADD `randomize_answer` tinyint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `exam_groups` ADD CONSTRAINT `exam_groups_exam_id_exams_id_fk` FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_groups` ADD CONSTRAINT `exam_groups_group_id_groups_id_fk` FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON DELETE cascade ON UPDATE no action;