import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Db } from "../db/index.js";
import { releases, users } from "../db/schema.js";

function verifySignature(secret: string, signature: string, body: string): boolean {
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface ReleaseEvent {
  action: string;
  release: {
    tag_name: string;
    assets: ReleaseAsset[];
    body?: string | null;
  };
}

/**
 * POST /api/webhooks/github — handle GitHub release events.
 *
 * When a release asset is uploaded (action: edited), checks for an app bundle
 * tarball and SHA256 (embedded in release body by CI). If found, upserts a
 * release record with isPublished: false — the admin manually publishes when ready.
 *
 * Note: for private repos, browser_download_url requires authentication.
 * The push route (which later fetches from appAssetUrl) must supply a
 * GitHub token via GITHUB_TOKEN env var when downloading.
 */
export function githubWebhookRoute(db: Db) {
  const app = new Hono();

  app.post("/", async (c) => {
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!secret) {
      console.error("[github-webhook] GITHUB_WEBHOOK_SECRET not set");
      return c.json({ error: "Webhook not configured" }, 503);
    }

    const signature = c.req.header("X-Hub-Signature-256");
    if (!signature) {
      return c.json({ error: "Missing signature" }, 401);
    }

    const rawBody = await c.req.text();
    if (!verifySignature(secret, signature, rawBody)) {
      return c.json({ error: "Invalid signature" }, 401);
    }

    const event = c.req.header("X-GitHub-Event");
    if (event !== "release") {
      return c.json({ ok: true, skipped: true });
    }

    const payload: ReleaseEvent = JSON.parse(rawBody);

    // Handle both "published" and "edited" (asset uploaded after creation)
    if (payload.action !== "published" && payload.action !== "edited") {
      return c.json({ ok: true, skipped: true });
    }

    const { tag_name, assets } = payload.release;
    const version = tag_name.replace(/^v/, "");

    // Find app bundle tarball
    const tarball = assets.find((a) => /^app-bundle-.*\.tar\.gz$/.test(a.name));
    if (!tarball) {
      return c.json({ ok: true, skipped: true, reason: "no app bundle asset" });
    }

    // Parse SHA256 from release body (CI writes <!-- app-bundle-sha256:HEX --> into it)
    const sha256Match = payload.release.body?.match(/<!-- app-bundle-sha256:([a-f0-9]{64}) -->/);
    if (!sha256Match) {
      return c.json({ ok: true, skipped: true, reason: "no app-bundle-sha256 in release body" });
    }
    const sha256 = sha256Match[1]!;

    // Parse admin manifest from release body (CI writes <!-- admin-manifest:JSON --> into it)
    let adminManifest: Record<string, string> | null = null;
    const manifestMatch = payload.release.body?.match(/<!-- admin-manifest:([\s\S]*?) -->/);
    if (manifestMatch) {
      try {
        adminManifest = JSON.parse(manifestMatch[1]!) as Record<string, string>;
      } catch {
        console.error(`[github-webhook] Malformed admin manifest in release ${version}`);
      }
    }

    // Upsert release record
    const [existing] = await db
      .select({ id: releases.id })
      .from(releases)
      .where(eq(releases.version, version));

    if (existing) {
      await db
        .update(releases)
        .set({
          appAssetUrl: tarball.browser_download_url,
          appSha256: sha256,
          ...(adminManifest && { adminManifest }),
        })
        .where(eq(releases.version, version));
      console.log(`[github-webhook] Updated release ${version} with app bundle asset`);
    } else {
      const [admin] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, "admin"))
        .limit(1);

      if (!admin) {
        console.error("[github-webhook] No admin user found for publishedBy");
        return c.json({ error: "No admin user" }, 500);
      }

      await db.insert(releases).values({
        version,
        releaseType: "app",
        appAssetUrl: tarball.browser_download_url,
        appSha256: sha256,
        adminManifest: adminManifest ?? undefined,
        isPublished: false,
        publishedBy: admin.id,
      });
      console.log(`[github-webhook] Created release ${version} (unpublished)`);
    }

    return c.json({ ok: true, version });
  });

  return app;
}
