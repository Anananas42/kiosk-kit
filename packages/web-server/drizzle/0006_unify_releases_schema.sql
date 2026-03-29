-- Rename existing columns
ALTER TABLE "releases" RENAME COLUMN "github_asset_url" TO "ota_asset_url";--> statement-breakpoint
ALTER TABLE "releases" RENAME COLUMN "sha256" TO "ota_sha256";--> statement-breakpoint

-- Make renamed columns nullable (existing rows already have values)
ALTER TABLE "releases" ALTER COLUMN "ota_asset_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "releases" ALTER COLUMN "ota_sha256" DROP NOT NULL;--> statement-breakpoint

-- Add new app bundle columns
ALTER TABLE "releases" ADD COLUMN "app_asset_url" text;--> statement-breakpoint
ALTER TABLE "releases" ADD COLUMN "app_sha256" text;--> statement-breakpoint

-- Replace (version, release_type) unique with version-only unique
ALTER TABLE "releases" DROP CONSTRAINT IF EXISTS "releases_version_type_unique";--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_version_unique" UNIQUE ("version");--> statement-breakpoint

-- At least one asset must be present
ALTER TABLE "releases" ADD CONSTRAINT "releases_at_least_one_asset" CHECK ("releases"."ota_asset_url" IS NOT NULL OR "releases"."app_asset_url" IS NOT NULL);--> statement-breakpoint

-- New enums for device_update_ops
CREATE TYPE "public"."update_type" AS ENUM('full', 'live');--> statement-breakpoint
CREATE TYPE "public"."update_action" AS ENUM('push', 'install');--> statement-breakpoint
CREATE TYPE "public"."update_result" AS ENUM('pending', 'success', 'failed');--> statement-breakpoint

-- New device_update_ops table
CREATE TABLE "device_update_ops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"update_type" "update_type" NOT NULL,
	"action" "update_action" NOT NULL,
	"version" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"result" "update_result" DEFAULT 'pending' NOT NULL,
	"triggered_by" text NOT NULL
);--> statement-breakpoint
ALTER TABLE "device_update_ops" ADD CONSTRAINT "device_update_ops_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_update_ops" ADD CONSTRAINT "device_update_ops_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_update_ops_device_started_idx" ON "device_update_ops" USING btree ("device_id","started_at" DESC NULLS LAST);
