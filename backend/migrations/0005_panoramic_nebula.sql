CREATE TABLE `settings` (
	`key` varchar(64) NOT NULL,
	`value` text NOT NULL,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `settings_key` PRIMARY KEY(`key`)
);
