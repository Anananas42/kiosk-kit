import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Db } from "../db/index.js";
import { backups, devices } from "../db/schema.js";
import { deleteFile, uploadFile } from "../services/s3.js";

const isDev = process.env.NODE_ENV === "development";
const MAX_RETAINED_BACKUPS = 30;

function getClientIp(c: { req: { header: (name: string) => string | undefined } }): string | null {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function backupUploadRoute(db: Db) {
  const app = new Hono();

  app.post("/:id/backup", async (c) => {
    const deviceId = c.req.param("id");

    if (!UUID_RE.test(deviceId)) return c.json({ error: "Not found" }, 404);

    // Look up the device
    const [device] = await db.select().from(devices).where(eq(devices.id, deviceId));
    if (!device) return c.json({ error: "Not found" }, 404);

    // Validate request source IP against device's Tailscale IP
    if (!isDev) {
      const clientIp = getClientIp(c);
      if (!clientIp || clientIp !== device.tailscaleIp) {
        return c.json({ error: "Forbidden" }, 403);
      }
    }

    // Read the gzipped body
    const body = await c.req.arrayBuffer();
    const buffer = Buffer.from(body);
    const sizeBytes = buffer.length;

    if (sizeBytes === 0) return c.json({ error: "Empty body" }, 400);

    // Upload to S3
    const timestamp = new Date().toISOString();
    const s3Key = `backups/${deviceId}/${timestamp}.sqlite.gz`;
    await uploadFile(s3Key, buffer, "application/gzip");

    // Insert metadata into DB
    const [backup] = await db
      .insert(backups)
      .values({ deviceId, s3Key, sizeBytes })
      .returning({ id: backups.id, sizeBytes: backups.sizeBytes, createdAt: backups.createdAt });

    // Enforce retention: delete backups beyond the 30th
    const allBackups = await db
      .select({ id: backups.id, s3Key: backups.s3Key })
      .from(backups)
      .where(eq(backups.deviceId, deviceId))
      .orderBy(desc(backups.createdAt));

    const toDelete = allBackups.slice(MAX_RETAINED_BACKUPS);
    if (toDelete.length > 0) {
      await Promise.all(
        toDelete.map(async (old) => {
          await deleteFile(old.s3Key);
          await db.delete(backups).where(eq(backups.id, old.id));
        }),
      );
    }

    return c.json({
      id: backup!.id,
      sizeBytes: backup!.sizeBytes,
      createdAt: backup!.createdAt.toISOString(),
    });
  });

  return app;
}
