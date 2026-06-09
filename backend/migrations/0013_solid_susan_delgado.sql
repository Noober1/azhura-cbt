CREATE TABLE `exam_batches` (
	`exam_id` varchar(36) NOT NULL,
	`batch` tinyint NOT NULL,
	CONSTRAINT `exam_batches_exam_id_batch_pk` PRIMARY KEY(`exam_id`,`batch`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `batch` tinyint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `exam_batches` ADD CONSTRAINT `exam_batches_exam_id_exams_id_fk` FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON DELETE cascade ON UPDATE no action;