ALTER TABLE "devices" ADD COLUMN "pairing_code" text;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_pairing_code_unique" UNIQUE("pairing_code");