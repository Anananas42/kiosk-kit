import { copyFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import Database, { type Database as SQLiteDatabase } from "better-sqlite3";
import { type BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema.js";

function findMigrationsFolder(): string {
  // Works from both src/db/ (dev) and dist/ (bundled)
  for (const candidate of [
    join(import.meta.dirname, "../../drizzle"),
    join(import.meta.dirname, "../drizzle"),
  ]) {
    if (existsSync(join(candidate, "meta/_journal.json"))) return candidate;
  }
  throw new Error("Cannot find drizzle migrations folder");
}

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

export function createDb(dataDir: string): { db: Db; sqlite: SQLiteDatabase } {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

  const dbPath = join(dataDir, "kioskkit.db");

  backupDatabase(dbPath);

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });

  migrate(db, { migrationsFolder: findMigrationsFolder() });

  return { db, sqlite };
}

export type Db = BetterSQLite3Database<typeof schema>;
