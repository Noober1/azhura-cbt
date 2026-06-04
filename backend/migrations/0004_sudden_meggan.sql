CREATE TABLE `session_questions` (
	`session_id` varchar(36) NOT NULL,
	`question_id` varchar(36) NOT NULL,
	`order_index` int NOT NULL,
	CONSTRAINT `session_questions_session_id_question_id_pk` PRIMARY KEY(`session_id`,`question_id`)
);
--> statement-breakpoint
ALTER TABLE `session_questions` ADD CONSTRAINT `session_questions_session_id_exam_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `exam_sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `session_questions` ADD CONSTRAINT `session_questions_question_id_questions_id_fk` FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON DELETE cascade ON UPDATE no action;