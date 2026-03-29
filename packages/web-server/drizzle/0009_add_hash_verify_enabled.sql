-- Per-device toggle to disable admin asset hash verification (for testing).
ALTER TABLE "devices" ADD COLUMN "hash_verify_enabled" boolean NOT NULL DEFAULT true;
