import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { runMigrations } from "./migrations.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "migrations");

function createInMemoryDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

function getVersion(db: Database.Database): number {
  const row = db.prepare("SELECT version FROM schema_version WHERE id = 1").get() as {
    version: number;
  };
  return row.version;
}

function getTableNames(db: Database.Database): string[] {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all() as { name: string }[];
  return rows.map((r) => r.name);
}

describe("migration runner", () => {
  it("runs all migrations from scratch on an empty database", () => {
    const db = createInMemoryDb();
    runMigrations(db);

    const tables = getTableNames(db);
    expect(tables).toContain("schema_version");
    expect(tables.length).toBeGreaterThan(1);
    expect(getVersion(db)).toBeGreaterThanOrEqual(1);
    db.close();
  });

  it("is idempotent — running twice does not error", () => {
    const db = createInMemoryDb();
    runMigrations(db);
    const v1 = getVersion(db);
    runMigrations(db);
    const v2 = getVersion(db);
    expect(v2).toBe(v1);
    db.close();
  });

  it("bootstraps existing databases that have tables but no schema_version", () => {
    const db = createInMemoryDb();

    // Simulate old-style database: apply 001_initial.sql directly (no schema_version)
    const initialSql = readFileSync(join(MIGRATIONS_DIR, "001_initial.sql"), "utf-8");
    db.exec(initialSql);

    runMigrations(db);

    // Should be bootstrapped to version 1 (not try to re-create tables)
    expect(getVersion(db)).toBe(1);
    db.close();
  });

  it("does not lose data when re-running on a populated database", () => {
    const db = createInMemoryDb();
    runMigrations(db);

    // Insert some data into a table we know exists from 001_initial
    db.prepare("INSERT INTO buyers (id, label) VALUES (1, '101')").run();
    db.prepare("INSERT INTO buyers (id, label) VALUES (2, '102')").run();
    const before = db.prepare("SELECT COUNT(*) as cnt FROM buyers").get() as { cnt: number };

    // Re-running migrations should not affect existing data
    runMigrations(db);

    const after = db.prepare("SELECT COUNT(*) as cnt FROM buyers").get() as { cnt: number };
    expect(after.cnt).toBe(before.cnt);
    db.close();
  });
});
