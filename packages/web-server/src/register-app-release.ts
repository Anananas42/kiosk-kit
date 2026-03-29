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

import { ReleaseType } from "@kioskkit/shared";
import { eq } from "drizzle-orm";
import { createDb } from "./db/index.js";
import { releases, users } from "./db/schema.js";

const [rawVersion, appAssetUrl, appSha256] = process.argv.slice(2);
// Strip leading "v" prefix if present (e.g. v1.2.3 -> 1.2.3)
const version = rawVersion?.replace(/^v/, "");

if (!version || !appAssetUrl || !appSha256) {
  console.error("Usage: tsx src/register-app-release.ts <version> <app_asset_url> <app_sha256>");
  process.exit(1);
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const db = createDb(connectionString);

  // Check if release already exists
  const [existing] = await db
    .select({ id: releases.id })
    .from(releases)
    .where(eq(releases.version, version));

  if (existing) {
    // Update existing release with app asset info
    await db
      .update(releases)
      .set({ appAssetUrl, appSha256, isPublished: true })
      .where(eq(releases.version, version));
    console.log(`Updated existing release ${version} with app bundle asset`);
  } else {
    // Find first admin user to use as publishedBy
    const [admin] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, "admin"))
      .limit(1);

    if (!admin) {
      throw new Error("No admin user found in database — cannot create release record");
    }

    await db.insert(releases).values({
      version,
      releaseType: ReleaseType.App,
      appAssetUrl,
      appSha256,
      isPublished: true,
      publishedBy: admin.id,
    });
    console.log(`Created new app release ${version} (publishedBy: ${admin.id})`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
