import { existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { copyFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema.js";

const MAX_BACKUPS = 3;

function backupDatabase(dbPath: string): void {
  if (!existsSync(dbPath)) return;

  const dir = join(dbPath, "..");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${dbPath}.bak-${timestamp}`;
  copyFileSync(dbPath, backupPath);

  // Keep only the last MAX_BACKUPS backups
  const backups = readdirSync(dir)
    .filter((f) => f.startsWith("kioskkit.db.bak-"))
    .sort()
    .map((f) => join(dir, f));

  while (backups.length > MAX_BACKUPS) {
    unlinkSync(backups.shift()!);
  }
}

export function createDb(dataDir: string) {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

  const dbPath = join(dataDir, "kioskkit.db");

  backupDatabase(dbPath);

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });

  migrate(db, { migrationsFolder: join(import.meta.dirname, "../../drizzle") });

  return { db, sqlite };
}

export type Db = ReturnType<typeof createDb>["db"];
