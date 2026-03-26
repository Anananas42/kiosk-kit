import { createReadStream, createWriteStream } from "node:fs";
import { readFile, unlink } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import type { Database as SQLiteDatabase } from "better-sqlite3";
import { Hono } from "hono";
import type { Store } from "./db/store.js";

/**
 * Creates a gzipped SQLite backup and returns it as a buffer.
 * Cleans up temp files in all cases.
 */
async function createBackupBuffer(sqlite: SQLiteDatabase): Promise<Buffer> {
  const timestamp = Date.now();
  const tempPath = `/tmp/kioskkit-backup-${timestamp}.sqlite`;
  const gzipPath = `${tempPath}.gz`;

  try {
    await sqlite.backup(tempPath);
    await pipeline(createReadStream(tempPath), createGzip(), createWriteStream(gzipPath));
    return await readFile(gzipPath);
  } finally {
    await unlink(tempPath).catch(() => {});
    await unlink(gzipPath).catch(() => {});
  }
}

/** GET /api/backup — returns a gzipped SQLite snapshot of the local database. */
export function backupRoute(sqlite: SQLiteDatabase, store: Store) {
  const app = new Hono();

  app.get("/", async () => {
    const body = await createBackupBuffer(sqlite);

    store.putSetting("lastBackupAt", new Date().toISOString());

    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Length": String(body.length),
      },
    });
  });

  return app;
}
