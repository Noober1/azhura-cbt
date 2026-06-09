ALTER TABLE `groups` ADD COLUMN IF NOT EXISTS `code` varchar(6) DEFAULT '' NOT NULL;--> statement-breakpoint
-- Back-fill existing rows with a unique code derived from their name before enforcing uniqueness.
UPDATE `groups` SET `code` = UPPER(SUBSTRING(REPLACE(`name`, 'Kelas ', ''), 1, 6)) WHERE `code` = '';--> statement-breakpoint
-- If two groups still have duplicate codes after the name-derived fill, make each unique by appending the row number.
UPDATE `groups` g1
  JOIN (SELECT id, ROW_NUMBER() OVER (PARTITION BY UPPER(SUBSTRING(REPLACE(name, 'Kelas ', ''), 1, 6)) ORDER BY id) AS rn FROM `groups`) r ON g1.id = r.id
  SET g1.`code` = CONCAT(UPPER(SUBSTRING(REPLACE(g1.`name`, 'Kelas ', ''), 1, 5)), CAST(r.rn AS CHAR))
  WHERE r.rn > 1;--> statement-breakpoint
ALTER TABLE `groups` ADD CONSTRAINT `groups_code_unique` UNIQUE(`code`);