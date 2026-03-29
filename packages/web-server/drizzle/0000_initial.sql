CREATE TYPE "public"."update_action" AS ENUM('push', 'install');--> statement-breakpoint
CREATE TYPE "public"."update_result" AS ENUM('pending', 'success', 'failed');--> statement-breakpoint
CREATE TYPE "public"."update_type" AS ENUM('full', 'live');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'customer');--> statement-breakpoint
CREATE TABLE "backups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"s3_key" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"restored_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "device_update_ops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"update_type" "update_type" NOT NULL,
	"action" "update_action" NOT NULL,
	"version" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"result" "update_result" DEFAULT 'pending' NOT NULL,
	"error" text,
	"triggered_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tailscale_node_id" text NOT NULL,
	"tailscale_ip" text,
	"user_id" text,
	"name" text NOT NULL,
	"hostname" text,
	"pairing_code" text,
	"backup_interval_hours" integer DEFAULT 2 NOT NULL,
	"max_retained_backups" integer DEFAULT 30 NOT NULL,
	"validate_proxy_hash" boolean DEFAULT true NOT NULL,
	"last_seen" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "devices_tailscale_node_id_unique" UNIQUE("tailscale_node_id"),
	CONSTRAINT "devices_pairing_code_unique" UNIQUE("pairing_code")
);
--> statement-breakpoint
CREATE TABLE "releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" text NOT NULL,
	"release_type" text DEFAULT 'ota' NOT NULL,
	"ota_asset_url" text,
	"ota_sha256" text,
	"app_asset_url" text,
	"app_sha256" text,
	"admin_manifest" jsonb,
	"release_notes" text,
	"is_published" boolean DEFAULT false NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"published_by" text NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "releases_version_unique" UNIQUE("version"),
	CONSTRAINT "releases_ota_sha256_unique" UNIQUE("ota_sha256"),
	CONSTRAINT "releases_app_sha256_unique" UNIQUE("app_sha256"),
	CONSTRAINT "releases_at_least_one_asset" CHECK ("releases"."ota_asset_url" IS NOT NULL OR "releases"."app_asset_url" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"google_id" text NOT NULL,
	"role" "user_role" DEFAULT 'customer' NOT NULL,
	"stripe_customer_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_google_id_unique" UNIQUE("google_id")
);
--> statement-breakpoint
ALTER TABLE "backups" ADD CONSTRAINT "backups_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_operations" ADD CONSTRAINT "device_operations_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_update_ops" ADD CONSTRAINT "device_update_ops_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_update_ops" ADD CONSTRAINT "device_update_ops_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "backups_device_id_created_at_idx" ON "backups" USING btree ("device_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "device_ops_device_type_started_idx" ON "device_operations" USING btree ("device_id","type","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "device_update_ops_device_started_idx" ON "device_update_ops" USING btree ("device_id","started_at" DESC NULLS LAST);