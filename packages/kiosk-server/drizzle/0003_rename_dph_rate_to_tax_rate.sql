ALTER TABLE `catalog_items` RENAME COLUMN `dph_rate` TO `tax_rate`;--> statement-breakpoint
ALTER TABLE `records` RENAME COLUMN `dph_rate` TO `tax_rate`;
