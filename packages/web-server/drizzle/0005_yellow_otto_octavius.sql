ALTER TABLE "devices" ADD COLUMN "backup_interval_hours" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "max_retained_backups" integer DEFAULT 30 NOT NULL;