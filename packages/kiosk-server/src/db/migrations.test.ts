import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { runMigrations } from "./migrations.js";

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
    expect(tables).toContain("buyers");
    expect(tables).toContain("catalog_categories");
    expect(tables).toContain("catalog_items");
    expect(tables).toContain("records");
    expect(tables).toContain("settings");
    expect(tables).toContain("preorder_config");

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

    // Simulate old-style migration (tables exist, no schema_version)
    db.exec(`
      CREATE TABLE buyers (id INTEGER PRIMARY KEY, label TEXT NOT NULL);
      CREATE TABLE catalog_categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, preorder INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE catalog_items (id INTEGER PRIMARY KEY AUTOINCREMENT, category_id INTEGER NOT NULL REFERENCES catalog_categories(id) ON DELETE CASCADE, name TEXT NOT NULL, quantity TEXT NOT NULL DEFAULT '', price TEXT NOT NULL DEFAULT '', dph_rate TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE records (id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, buyer INTEGER NOT NULL REFERENCES buyers(id), count INTEGER NOT NULL, category TEXT NOT NULL, item TEXT NOT NULL, item_id TEXT NOT NULL DEFAULT '', quantity TEXT NOT NULL DEFAULT '', price TEXT NOT NULL DEFAULT '');
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE preorder_config (weekday INTEGER PRIMARY KEY, ordering INTEGER NOT NULL DEFAULT 1, delivery INTEGER NOT NULL DEFAULT 1);
    `);

    runMigrations(db);

    // Should be bootstrapped to version 1 (not try to re-create tables)
    expect(getVersion(db)).toBe(1);
    db.close();
  });

  it("runs migrations with seed data present", () => {
    const db = createInMemoryDb();
    runMigrations(db);

    // Insert seed data
    db.prepare("INSERT INTO buyers (id, label) VALUES (1, '101')").run();
    db.prepare("INSERT INTO buyers (id, label) VALUES (2, '102')").run();
    db.prepare(
      "INSERT INTO catalog_categories (name, preorder, sort_order) VALUES ('Drinks', 0, 0)",
    ).run();
    db.prepare(
      "INSERT INTO catalog_items (category_id, name, quantity, price, dph_rate, sort_order) VALUES (1, 'Beer', '0.5l', '45', '', 0)",
    ).run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('locale', 'cs')").run();
    db.prepare(
      "INSERT INTO preorder_config (weekday, ordering, delivery) VALUES (1, 1, 1)",
    ).run();
    db.prepare(
      "INSERT INTO records (id, timestamp, buyer, count, category, item, item_id, quantity, price) VALUES ('r1', '2024-01-01', 1, 1, 'Drinks', 'Beer', '1', '0.5l', '45')",
    ).run();

    // Re-running migrations should not affect existing data
    runMigrations(db);

    const buyers = db.prepare("SELECT COUNT(*) as cnt FROM buyers").get() as { cnt: number };
    expect(buyers.cnt).toBe(2);

    const items = db.prepare("SELECT COUNT(*) as cnt FROM catalog_items").get() as { cnt: number };
    expect(items.cnt).toBe(1);

    db.close();
  });
});
