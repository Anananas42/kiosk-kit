import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Store } from "./store.js";
import * as schema from "./schema.js";

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: join(import.meta.dirname, "../../drizzle") });
  return { db, sqlite };
}

describe("migrations", () => {
  it("applies cleanly to a fresh in-memory database", () => {
    const { sqlite } = createTestDb();
    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const tableNames = tables
      .map((t) => t.name)
      .filter((n) => !n.startsWith("__") && n !== "sqlite_sequence");
    expect(tableNames).toEqual([
      "buyers",
      "catalog_categories",
      "catalog_items",
      "preorder_config",
      "records",
      "settings",
    ]);
    sqlite.close();
  });
});

describe("Store", () => {
  let store: Store;
  let sqlite: Database.Database;

  beforeEach(() => {
    const result = createTestDb();
    sqlite = result.sqlite;
    store = new Store(result.db);
  });

  afterEach(() => {
    sqlite.close();
  });

  // ── Catalog ─────────────────────────────────────────────────────────

  it("deletes a category and cascades to items", () => {
    const catId = store.createCategory("Temp", false, 0);
    store.createItem(catId, "Item", "1", "10", "", 0);
    store.deleteCategory(catId);
    expect(store.getCatalog()).toEqual([]);
  });

  // ── Records ─────────────────────────────────────────────────────────

  it("computes item balance with itemId", () => {
    store.createBuyer(1, "101");
    store.insertRecord({
      id: "r1",
      timestamp: "t1",
      buyer: 1,
      count: 5,
      category: "C",
      item: "Beer",
      itemId: "item-1",
      quantity: "",
      price: "",
    });
    store.insertRecord({
      id: "r2",
      timestamp: "t2",
      buyer: 1,
      count: -2,
      category: "C",
      item: "Beer",
      itemId: "item-1",
      quantity: "",
      price: "",
    });
    expect(store.getItemBalance(1, "Beer", "item-1")).toBe(3);
  });

  it("computes item balance with legacy name fallback", () => {
    store.createBuyer(1, "101");
    store.insertRecord({
      id: "r1",
      timestamp: "t1",
      buyer: 1,
      count: 10,
      category: "C",
      item: "Beer",
      itemId: "",
      quantity: "",
      price: "",
    });
    store.insertRecord({
      id: "r2",
      timestamp: "t2",
      buyer: 1,
      count: 5,
      category: "C",
      item: "Beer",
      itemId: "item-1",
      quantity: "",
      price: "",
    });
    // Should sum both legacy (itemId='') and new (itemId='item-1')
    expect(store.getItemBalance(1, "Beer", "item-1")).toBe(15);
  });

  it("computes item balance without itemId", () => {
    store.createBuyer(1, "101");
    store.insertRecord({
      id: "r1",
      timestamp: "t1",
      buyer: 1,
      count: 7,
      category: "C",
      item: "Beer",
      itemId: "",
      quantity: "",
      price: "",
    });
    expect(store.getItemBalance(1, "Beer")).toBe(7);
  });

  // ── Settings ────────────────────────────────────────────────────────

  it("returns null when no settings exist", () => {
    expect(store.getSettings()).toBeNull();
  });

  it("coerces setting values to correct types", () => {
    store.putSetting("locale", "en");
    store.putSetting("currency", "USD");
    store.putSetting("buyerNoun", "room");
    store.putSetting("maintenance", "false");
    store.putSetting("idleDimMs", "5000");
    store.putSetting("inactivityTimeoutMs", "30000");

    const s = store.getSettings();
    expect(s).toEqual({
      locale: "en",
      currency: "USD",
      buyerNoun: "room",
      maintenance: false,
      idleDimMs: 5000,
      inactivityTimeoutMs: 30000,
    });
  });

  it("upserts settings on conflict", () => {
    store.putSetting("locale", "cs");
    store.putSetting("locale", "en");
    store.putSetting("currency", "CZK");
    store.putSetting("buyerNoun", "a");
    store.putSetting("maintenance", "false");
    store.putSetting("idleDimMs", "0");
    store.putSetting("inactivityTimeoutMs", "0");
    expect(store.getSettings()!.locale).toBe("en");
  });

  // ── Preorder Config ─────────────────────────────────────────────────

  it("returns null when no preorder config exists", () => {
    expect(store.getPreorderConfig()).toBeNull();
  });

  it("aggregates preorder rows into day arrays", () => {
    for (let i = 0; i < 7; i++) {
      store.putPreorderConfig(i, i % 2 === 0, true);
    }
    const config = store.getPreorderConfig()!;
    expect(config.orderingDays).toEqual([true, false, true, false, true, false, true]);
    expect(config.deliveryDays).toEqual([true, true, true, true, true, true, true]);
  });

  it("upserts preorder config on conflict", () => {
    store.putPreorderConfig(0, true, true);
    store.putPreorderConfig(0, false, false);
    for (let i = 1; i < 7; i++) {
      store.putPreorderConfig(i, true, true);
    }
    const config = store.getPreorderConfig()!;
    expect(config.orderingDays[0]).toBe(false);
    expect(config.deliveryDays[0]).toBe(false);
  });
});
