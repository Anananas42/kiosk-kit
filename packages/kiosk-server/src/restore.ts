import { copyFileSync, existsSync, readdirSync, renameSync, unlinkSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import Database, { type Database as SQLiteDatabase } from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { Hono } from "hono";
import type { AppContext } from "./app.js";
import * as schema from "./db/schema.js";
import { Store } from "./db/store.js";

const MAX_SAFETY_BACKUPS = 3;
const SQLITE_MAGIC = "SQLite format 3\0";

function reopenDatabase(dbPath: string): { sqlite: SQLiteDatabase; store: Store } {
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  return { sqlite, store: new Store(db) };
}

/**
 * POST /api/restore — accepts a gzipped SQLite file and replaces the current database.
 * Creates a safety backup before replacing.
 */
export function restoreRoute(ctx: AppContext, dataDir: string) {
  const app = new Hono();

  app.post("/", async (c) => {
    const dbPath = join(dataDir, "kioskkit.db");

    // Read and decompress the uploaded gzipped file
    const body = await c.req.arrayBuffer();
    if (body.byteLength === 0) {
      return c.json({ error: "Empty request body" }, 400);
    }

    let decompressed: Buffer;
    try {
      decompressed = gunzipSync(Buffer.from(body));
    } catch {
      return c.json({ error: "Failed to decompress gzip data" }, 400);
    }

    if (
      decompressed.length < 16 ||
      decompressed.subarray(0, 16).toString("ascii") !== SQLITE_MAGIC
    ) {
      return c.json({ error: "Uploaded file is not a valid SQLite database" }, 400);
    }

    // Create a safety backup of the current database
    let safetyBackupPath = "";
    if (existsSync(dbPath)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      safetyBackupPath = join(dataDir, `kioskkit-pre-restore-${timestamp}.sqlite`);
      copyFileSync(dbPath, safetyBackupPath);

      // Keep at most MAX_SAFETY_BACKUPS safety backups
      const safetyBackups = readdirSync(dataDir)
        .filter((f) => f.startsWith("kioskkit-pre-restore-"))
        .sort()
        .map((f) => join(dataDir, f));

      while (safetyBackups.length > MAX_SAFETY_BACKUPS) {
        unlinkSync(safetyBackups.shift()!);
      }
    }

    // Write decompressed data to a temp file
    const tempPath = join(dataDir, "kioskkit-restore-temp.sqlite");

    try {
      await writeFile(tempPath, decompressed);

      // Close the current database connection
      ctx.sqlite.close();

      // Replace the database file
      renameSync(tempPath, dbPath);

      // Reopen the database connection and update shared context
      const reopened = reopenDatabase(dbPath);
      ctx.sqlite = reopened.sqlite;
      ctx.store = reopened.store;

      return c.json({ success: true, safetyBackupPath });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[restore] Failed to restore database:", message);

      // Clean up temp file
      try {
        if (existsSync(tempPath)) unlinkSync(tempPath);
      } catch {}

      // Try to reopen the original database (or safety backup)
      try {
        if (!existsSync(dbPath) && safetyBackupPath && existsSync(safetyBackupPath)) {
          renameSync(safetyBackupPath, dbPath);
        }
        const reopened = reopenDatabase(dbPath);
        ctx.sqlite = reopened.sqlite;
        ctx.store = reopened.store;
      } catch (reopenErr) {
        console.error(
          "[restore] CRITICAL: Failed to reopen database after failed restore:",
          reopenErr instanceof Error ? reopenErr.message : reopenErr,
        );
      }

      return c.json({ error: `Restore failed: ${message}` }, 500);
    }
  });

  return app;
}
