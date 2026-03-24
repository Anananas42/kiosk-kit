CREATE TABLE `buyers` (
	`id` integer PRIMARY KEY NOT NULL,
	`label` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `catalog_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`preorder` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `catalog_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category_id` integer NOT NULL,
	`name` text NOT NULL,
	`quantity` text DEFAULT '' NOT NULL,
	`price` text DEFAULT '' NOT NULL,
	`dph_rate` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `catalog_categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `preorder_config` (
	`weekday` integer PRIMARY KEY NOT NULL,
	`ordering` integer DEFAULT 1 NOT NULL,
	`delivery` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`timestamp` text NOT NULL,
	`buyer` integer NOT NULL,
	`count` integer NOT NULL,
	`category` text NOT NULL,
	`item` text NOT NULL,
	`item_id` text DEFAULT '' NOT NULL,
	`quantity` text DEFAULT '' NOT NULL,
	`price` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`buyer`) REFERENCES `buyers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
