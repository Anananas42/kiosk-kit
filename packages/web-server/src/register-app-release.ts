/**
 * register-app-release.ts — CI script to register an app bundle release in the database.
 *
 * Usage:
 *   DATABASE_URL=... tsx src/register-app-release.ts <version> <app_asset_url> <app_sha256>
 *
 * If a release with this version already exists, it updates the app asset fields.
 * If not, it creates a new release (using the first admin user as publishedBy).
 */

import dotenv from "dotenv";

dotenv.config({ path: "../../.env" });

import pg from "pg";

const [rawVersion, appAssetUrl, appSha256] = process.argv.slice(2);
// Strip leading "v" prefix if present (e.g. v1.2.3 -> 1.2.3)
const version = rawVersion?.replace(/^v/, "");

if (!version || !appAssetUrl || !appSha256) {
  console.error("Usage: tsx src/register-app-release.ts <version> <app_asset_url> <app_sha256>");
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const client = new pg.Client({ connectionString });
await client.connect();

try {
  // Check if release already exists
  const existing = await client.query("SELECT id FROM releases WHERE version = $1", [version]);

  if (existing.rows.length > 0) {
    // Update existing release with app asset info
    await client.query(
      `UPDATE releases
       SET app_asset_url = $1, app_sha256 = $2, is_published = true
       WHERE version = $3`,
      [appAssetUrl, appSha256, version],
    );
    console.log(`Updated existing release ${version} with app bundle asset`);
  } else {
    // Find first admin user to use as publishedBy
    const adminResult = await client.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");

    if (adminResult.rows.length === 0) {
      console.error("No admin user found in database — cannot create release record");
      process.exit(1);
    }

    const adminId = adminResult.rows[0].id;

    await client.query(
      `INSERT INTO releases (version, release_type, app_asset_url, app_sha256, is_published, published_by)
       VALUES ($1, 'app', $2, $3, true, $4)`,
      [version, appAssetUrl, appSha256, adminId],
    );
    console.log(`Created new app release ${version} (publishedBy: ${adminId})`);
  }
} finally {
  await client.end();
}
