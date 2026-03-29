-- Add error column to device_update_ops
ALTER TABLE "device_update_ops" ADD COLUMN "error" text;--> statement-breakpoint

-- Add unique constraints on SHA256 columns (nulls are ignored by Postgres unique)
ALTER TABLE "releases" ADD CONSTRAINT "releases_ota_sha256_unique" UNIQUE ("ota_sha256");--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_app_sha256_unique" UNIQUE ("app_sha256");
