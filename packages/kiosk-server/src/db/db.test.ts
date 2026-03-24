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

  // ── Buyers ──────────────────────────────────────────────────────────

  it("creates and retrieves buyers", () => {
    store.createBuyer(1, "101");
    store.createBuyer(2, "102");
    const buyers = store.getBuyers();
    expect(buyers).toEqual([
      { id: 1, label: "101" },
      { id: 2, label: "102" },
    ]);
  });

  it("updates a buyer", () => {
    store.createBuyer(1, "old");
    store.updateBuyer(1, "new");
    expect(store.getBuyers()[0].label).toBe("new");
  });

  it("deletes a buyer", () => {
    store.createBuyer(1, "101");
    store.deleteBuyer(1);
    expect(store.getBuyers()).toEqual([]);
  });

  // ── Catalog ─────────────────────────────────────────────────────────

  it("creates categories and items, retrieves full catalog", () => {
    const catId = store.createCategory("Drinks", false, 0);
    store.createItem(catId, "Beer", "0.5l", "45", "", 0);
    store.createItem(catId, "Wine", "0.2l", "55", "", 1);

    const catalog = store.getCatalog();
    expect(catalog).toHaveLength(1);
    expect(catalog[0].name).toBe("Drinks");
    expect(catalog[0].preorder).toBe(false);
    expect(catalog[0].items).toHaveLength(2);
    expect(catalog[0].items[0].name).toBe("Beer");
    expect(catalog[0].items[1].name).toBe("Wine");
  });

  it("updates a category", () => {
    const catId = store.createCategory("Old", false, 0);
    store.updateCategory(catId, "New", true, 1);
    const catalog = store.getCatalog();
    expect(catalog[0].name).toBe("New");
    expect(catalog[0].preorder).toBe(true);
  });

  it("deletes a category and cascades to items", () => {
    const catId = store.createCategory("Temp", false, 0);
    store.createItem(catId, "Item", "1", "10", "", 0);
    store.deleteCategory(catId);
    expect(store.getCatalog()).toEqual([]);
  });

  it("updates and deletes items", () => {
    const catId = store.createCategory("Cat", false, 0);
    const itemId = store.createItem(catId, "Old", "1", "10", "", 0);
    store.updateItem(itemId, "New", "2", "20", "21", 1);
    const items = store.getCatalog()[0].items;
    expect(items[0].name).toBe("New");
    expect(items[0].price).toBe("20");

    store.deleteItem(itemId);
    expect(store.getCatalog()[0].items).toEqual([]);
  });

  // ── Records ─────────────────────────────────────────────────────────

  it("inserts and retrieves records", () => {
    store.createBuyer(1, "101");
    store.insertRecord({
      id: "r1",
      timestamp: "2024-01-01T00:00:00Z",
      buyer: 1,
      count: 3,
      category: "Drinks",
      item: "Beer",
      itemId: "item-1",
      quantity: "0.5l",
      price: "45",
    });
    const records = store.getRecords();
    expect(records).toHaveLength(1);
    expect(records[0].item).toBe("Beer");
    expect(records[0].count).toBe(3);
  });

  it("retrieves records by buyer", () => {
    store.createBuyer(1, "101");
    store.createBuyer(2, "102");
    store.insertRecord({
      id: "r1",
      timestamp: "2024-01-01T00:00:00Z",
      buyer: 1,
      count: 1,
      category: "C",
      item: "I",
      itemId: "",
      quantity: "",
      price: "",
    });
    store.insertRecord({
      id: "r2",
      timestamp: "2024-01-01T00:00:01Z",
      buyer: 2,
      count: 2,
      category: "C",
      item: "I",
      itemId: "",
      quantity: "",
      price: "",
    });
    expect(store.getRecordsByBuyer(1)).toHaveLength(1);
    expect(store.getRecordsByBuyer(2)).toHaveLength(1);
  });

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
    // Legacy record without itemId
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
    // New record with itemId
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

  it("puts and gets settings", () => {
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

  it("upserts settings", () => {
    store.putSetting("locale", "cs");
    store.putSetting("locale", "en");
    // Should have only one row, not error
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

  it("puts and gets preorder config", () => {
    for (let i = 0; i < 7; i++) {
      store.putPreorderConfig(i, i % 2 === 0, true);
    }
    const config = store.getPreorderConfig()!;
    expect(config.orderingDays).toEqual([true, false, true, false, true, false, true]);
    expect(config.deliveryDays).toEqual([true, true, true, true, true, true, true]);
  });

  it("upserts preorder config", () => {
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
