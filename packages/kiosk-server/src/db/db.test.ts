import { join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "./schema.js";
import { Store } from "./store.js";

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
      "pairing_state",
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
      taxRate: "",
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
      taxRate: "",
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
      taxRate: "",
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
      taxRate: "",
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
      taxRate: "",
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

  // ── Consumption Report Queries ──────────────────────────────────────

  it("getConsumptionSummary aggregates by item with by_buyer JSON", () => {
    store.createBuyer(1, "101");
    store.createBuyer(2, "102");
    store.insertRecord({
      id: "r1",
      timestamp: "2024-01-15T10:00:00Z",
      buyer: 1,
      count: 3,
      category: "Drinks",
      item: "Coffee",
      itemId: "10",
      quantity: "1 cup",
      price: "150",
      taxRate: "21",
    });
    store.insertRecord({
      id: "r2",
      timestamp: "2024-01-15T11:00:00Z",
      buyer: 2,
      count: 2,
      category: "Drinks",
      item: "Coffee",
      itemId: "10",
      quantity: "1 cup",
      price: "100",
      taxRate: "21",
    });
    store.insertRecord({
      id: "r3",
      timestamp: "2024-01-15T12:00:00Z",
      buyer: 1,
      count: -1,
      category: "Drinks",
      item: "Coffee",
      itemId: "10",
      quantity: "1 cup",
      price: "-50",
      taxRate: "21",
    });

    const rows = store.getConsumptionSummary("2024-01-01T00:00:00Z", "2024-02-01T00:00:00Z");
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.itemKey).toBe("10");
    expect(row.item).toBe("Coffee");
    expect(row.taxRate).toBe("21");
    expect(row.totalCount).toBe(4); // 3 + 2 - 1
    expect(row.grandTotal).toBe(200); // 150 + 100 - 50

    const byBuyer = JSON.parse(row.byBuyer);
    expect(byBuyer["1"].count).toBe(2); // 3 - 1
    expect(byBuyer["1"].total).toBe(100); // 150 - 50
    expect(byBuyer["2"].count).toBe(2);
    expect(byBuyer["2"].total).toBe(100);
  });

  it("getConsumptionSummary filters by date range", () => {
    store.createBuyer(1, "101");
    store.insertRecord({
      id: "r1",
      timestamp: "2024-01-10T10:00:00Z",
      buyer: 1,
      count: 1,
      category: "Snacks",
      item: "Cookie",
      itemId: "20",
      quantity: "1ks",
      price: "30",
      taxRate: "15",
    });
    store.insertRecord({
      id: "r2",
      timestamp: "2024-02-10T10:00:00Z",
      buyer: 1,
      count: 1,
      category: "Snacks",
      item: "Cookie",
      itemId: "20",
      quantity: "1ks",
      price: "30",
      taxRate: "15",
    });

    const rows = store.getConsumptionSummary("2024-02-01T00:00:00Z");
    expect(rows).toHaveLength(1);
    expect(rows[0].totalCount).toBe(1);
  });

  it("getTotalsByBuyerAndTaxRate groups by buyer and taxRate", () => {
    store.createBuyer(1, "101");
    store.createBuyer(2, "102");
    store.insertRecord({
      id: "r1",
      timestamp: "2024-01-15T10:00:00Z",
      buyer: 1,
      count: 2,
      category: "Drinks",
      item: "Coffee",
      itemId: "10",
      quantity: "",
      price: "100",
      taxRate: "21",
    });
    store.insertRecord({
      id: "r2",
      timestamp: "2024-01-15T11:00:00Z",
      buyer: 1,
      count: 1,
      category: "Snacks",
      item: "Cookie",
      itemId: "20",
      quantity: "",
      price: "30",
      taxRate: "15",
    });
    store.insertRecord({
      id: "r3",
      timestamp: "2024-01-15T12:00:00Z",
      buyer: 2,
      count: 3,
      category: "Drinks",
      item: "Coffee",
      itemId: "10",
      quantity: "",
      price: "150",
      taxRate: "21",
    });

    const totals = store.getTotalsByBuyerAndTaxRate("2024-01-01T00:00:00Z");
    expect(totals).toHaveLength(3);

    const b1r21 = totals.find((t) => t.buyer === 1 && t.taxRate === "21");
    expect(b1r21?.netCount).toBe(2);
    expect(b1r21?.netTotal).toBe(100);

    const b1r15 = totals.find((t) => t.buyer === 1 && t.taxRate === "15");
    expect(b1r15?.netCount).toBe(1);
    expect(b1r15?.netTotal).toBe(30);

    const b2r21 = totals.find((t) => t.buyer === 2 && t.taxRate === "21");
    expect(b2r21?.netCount).toBe(3);
    expect(b2r21?.netTotal).toBe(150);
  });
});
