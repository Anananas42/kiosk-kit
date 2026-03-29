ALTER TABLE "releases" DROP CONSTRAINT "releases_version_unique";--> statement-breakpoint
ALTER TABLE "releases" ADD COLUMN "release_type" text DEFAULT 'ota' NOT NULL;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_version_type_unique" UNIQUE("version","release_type");