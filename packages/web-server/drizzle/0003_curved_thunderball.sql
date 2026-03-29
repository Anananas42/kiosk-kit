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
ALTER TABLE "backups" ADD COLUMN "restored_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "device_operations" ADD CONSTRAINT "device_operations_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_ops_device_type_started_idx" ON "device_operations" USING btree ("device_id","type","started_at" DESC NULLS LAST);