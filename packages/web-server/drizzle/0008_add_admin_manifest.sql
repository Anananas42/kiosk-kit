-- Add admin_manifest column to releases for kiosk-admin static asset hash verification.
-- Stores a JSON object mapping file paths to SHA256 hashes, e.g.:
-- { "index.html": "abc123...", "assets/index-CWRnqJxn.js": "def456..." }
ALTER TABLE "releases" ADD COLUMN "admin_manifest" jsonb;
