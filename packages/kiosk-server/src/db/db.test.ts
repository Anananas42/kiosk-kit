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

  // ── Item balance: SUM aggregation + legacy itemId OR-fallback ───────

  it("sums records and falls back to legacy name match", () => {
    store.createBuyer(1, "101");
    // Legacy record (no itemId)
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
    // New record (with itemId)
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
    // Both legacy and new records are summed via the OR condition
    expect(store.getItemBalance(1, "Beer", "item-1")).toBe(15);
    // Without itemId, matches all records by name (regardless of itemId)
    expect(store.getItemBalance(1, "Beer")).toBe(15);
  });

  // ── Settings: string → number/boolean coercion ─────────────────────

  it("coerces stored string values to typed settings", () => {
    store.putSetting("locale", "en");
    store.putSetting("currency", "USD");
    store.putSetting("buyerNoun", "room");
    store.putSetting("maintenance", "true");
    store.putSetting("idleDimMs", "5000");
    store.putSetting("inactivityTimeoutMs", "30000");

    const s = store.getSettings();
    expect(s).toEqual({
      locale: "en",
      currency: "USD",
      buyerNoun: "room",
      maintenance: true,
      idleDimMs: 5000,
      inactivityTimeoutMs: 30000,
    });
  });

  // ── Preorder config: rows → boolean arrays ─────────────────────────

  it("aggregates weekday rows into day arrays", () => {
    for (let i = 0; i < 7; i++) {
      store.putPreorderConfig(i, i % 2 === 0, true);
    }
    const config = store.getPreorderConfig()!;
    expect(config.orderingDays).toEqual([true, false, true, false, true, false, true]);
    expect(config.deliveryDays).toEqual([true, true, true, true, true, true, true]);
  });
});
