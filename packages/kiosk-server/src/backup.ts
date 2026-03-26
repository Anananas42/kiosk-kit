import { createReadStream, createWriteStream } from "node:fs";
import { readFile, unlink } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import type { Database as SQLiteDatabase } from "better-sqlite3";
import type { Store } from "./db/store.js";
import { env } from "./env.js";

const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const INITIAL_DELAY_MS = 60 * 1000;

async function performBackup(sqlite: SQLiteDatabase, store: Store): Promise<void> {
  const timestamp = Date.now();
  const tempPath = `/tmp/kioskkit-backup-${timestamp}.sqlite`;
  const gzipPath = `${tempPath}.gz`;

  try {
    await sqlite.backup(tempPath);

    await pipeline(createReadStream(tempPath), createGzip(), createWriteStream(gzipPath));

    const body = await readFile(gzipPath);

    const url = `${env.webServerUrl}/api/devices/${env.deviceId}/backup`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/gzip" },
      body,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Upload failed: ${res.status} ${text}`);
    }

    store.putSetting("lastBackupAt", new Date().toISOString());
    console.log("[backup] Backup uploaded successfully");
  } finally {
    await unlink(tempPath).catch(() => {});
    await unlink(gzipPath).catch(() => {});
  }
}

export function startBackupSchedule(sqlite: SQLiteDatabase, store: Store): void {
  const run = () => {
    performBackup(sqlite, store).catch((err) => {
      console.error("[backup] Backup failed:", err instanceof Error ? err.message : err);
    });
  };

  setTimeout(() => {
    run();
    setInterval(run, BACKUP_INTERVAL_MS);
  }, INITIAL_DELAY_MS);

  console.log("[backup] Scheduled daily backups (first run in 60s)");
}
