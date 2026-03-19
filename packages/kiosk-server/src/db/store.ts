import type {
  Buyer,
  CatalogCategory,
  CatalogItem,
  EvidenceRow,
  KioskSettings,
  PreorderConfig,
  RecordEntry,
} from "@kioskkit/shared";
import type Database from "better-sqlite3";

// ── Buyers ──────────────────────────────────────────────────────────────────

export class Store {
  constructor(private db: Database.Database) {}

  // ── Buyers ────────────────────────────────────────────────────────────

  getBuyers(): Buyer[] {
    return this.db.prepare("SELECT id, label FROM buyers ORDER BY id").all() as Buyer[];
  }

  createBuyer(id: number, label: string): void {
    this.db.prepare("INSERT INTO buyers (id, label) VALUES (?, ?)").run(id, label);
  }

  updateBuyer(id: number, label: string): void {
    this.db.prepare("UPDATE buyers SET label = ? WHERE id = ?").run(label, id);
  }

  deleteBuyer(id: number): void {
    this.db.prepare("DELETE FROM buyers WHERE id = ?").run(id);
  }

  // ── Catalog ─────────────────────────────────────────────────────────────

  getCatalog(): CatalogCategory[] {
    const cats = this.db
      .prepare(
        "SELECT id, name, preorder, sort_order FROM catalog_categories ORDER BY sort_order, id",
      )
      .all() as Array<{ id: number; name: string; preorder: number; sort_order: number }>;

    const itemStmt = this.db.prepare(
      "SELECT id, name, quantity, price, dph_rate, sort_order FROM catalog_items WHERE category_id = ? ORDER BY sort_order, id",
    );

    return cats.map((cat) => {
      const items = itemStmt.all(cat.id) as Array<{
        id: number;
        name: string;
        quantity: string;
        price: string;
        dph_rate: string;
        sort_order: number;
      }>;
      return {
        id: String(cat.id),
        name: cat.name,
        preorder: cat.preorder === 1,
        items: items.map(
          (it): CatalogItem => ({
            id: String(it.id),
            name: it.name,
            quantity: it.quantity,
            price: it.price,
            dphRate: it.dph_rate,
          }),
        ),
      };
    });
  }

  createCategory(name: string, preorder: boolean, sortOrder: number): number {
    const result = this.db
      .prepare("INSERT INTO catalog_categories (name, preorder, sort_order) VALUES (?, ?, ?)")
      .run(name, preorder ? 1 : 0, sortOrder);
    return Number(result.lastInsertRowid);
  }

  updateCategory(id: number, name: string, preorder: boolean, sortOrder: number): void {
    this.db
      .prepare("UPDATE catalog_categories SET name = ?, preorder = ?, sort_order = ? WHERE id = ?")
      .run(name, preorder ? 1 : 0, sortOrder, id);
  }

  deleteCategory(id: number): void {
    this.db.prepare("DELETE FROM catalog_categories WHERE id = ?").run(id);
  }

  createItem(
    categoryId: number,
    name: string,
    quantity: string,
    price: string,
    dphRate: string,
    sortOrder: number,
  ): number {
    const result = this.db
      .prepare(
        "INSERT INTO catalog_items (category_id, name, quantity, price, dph_rate, sort_order) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(categoryId, name, quantity, price, dphRate, sortOrder);
    return Number(result.lastInsertRowid);
  }

  updateItem(
    id: number,
    name: string,
    quantity: string,
    price: string,
    dphRate: string,
    sortOrder: number,
  ): void {
    this.db
      .prepare(
        "UPDATE catalog_items SET name = ?, quantity = ?, price = ?, dph_rate = ?, sort_order = ? WHERE id = ?",
      )
      .run(name, quantity, price, dphRate, sortOrder, id);
  }

  deleteItem(id: number): void {
    this.db.prepare("DELETE FROM catalog_items WHERE id = ?").run(id);
  }

  // ── Records ─────────────────────────────────────────────────────────────

  getRecords(): EvidenceRow[] {
    return this.db
      .prepare(
        `SELECT timestamp, buyer, count, category, item, item_id AS itemId, quantity, price
         FROM records ORDER BY timestamp DESC`,
      )
      .all() as EvidenceRow[];
  }

  getRecordsByBuyer(buyer: number): EvidenceRow[] {
    return this.db
      .prepare(
        `SELECT timestamp, buyer, count, category, item, item_id AS itemId, quantity, price
         FROM records WHERE buyer = ? ORDER BY timestamp DESC`,
      )
      .all(buyer) as EvidenceRow[];
  }

  getItemBalance(buyer: number, item: string, itemId?: string): number {
    if (itemId) {
      // Match by itemId, plus legacy name-only fallback
      const row = this.db
        .prepare(
          `SELECT COALESCE(SUM(count), 0) AS total FROM records
           WHERE buyer = ? AND (item_id = ? OR (item_id = '' AND item = ?))`,
        )
        .get(buyer, itemId, item) as { total: number };
      return row.total;
    }
    const row = this.db
      .prepare("SELECT COALESCE(SUM(count), 0) AS total FROM records WHERE buyer = ? AND item = ?")
      .get(buyer, item) as { total: number };
    return row.total;
  }

  insertRecord(entry: RecordEntry): void {
    this.db
      .prepare(
        `INSERT INTO records (id, timestamp, buyer, count, category, item, item_id, quantity, price)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.id,
        entry.timestamp,
        entry.buyer,
        entry.count,
        entry.category,
        entry.item,
        entry.itemId,
        entry.quantity,
        entry.price,
      );
  }

  // ── Settings ────────────────────────────────────────────────────────────

  getSettings(): KioskSettings | null {
    const rows = this.db.prepare("SELECT key, value FROM settings").all() as Array<{
      key: string;
      value: string;
    }>;
    if (rows.length === 0) return null;

    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return {
      idleDimMs: Number(map.idleDimMs) || 0,
      inactivityTimeoutMs: Number(map.inactivityTimeoutMs) || 0,
      maintenance: map.maintenance === "true",
      locale: map.locale || "cs",
      currency: map.currency || "CZK",
      buyerNoun: map.buyerNoun || "apartmán",
    };
  }

  putSetting(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value);
  }

  // ── Preorder Config ───────────────────────────────────────────────────────

  getPreorderConfig(): PreorderConfig | null {
    const rows = this.db
      .prepare("SELECT weekday, ordering, delivery FROM preorder_config ORDER BY weekday")
      .all() as Array<{ weekday: number; ordering: number; delivery: number }>;
    if (rows.length === 0) return null;

    const orderingDays = Array<boolean>(7).fill(true);
    const deliveryDays = Array<boolean>(7).fill(true);
    for (const row of rows) {
      orderingDays[row.weekday] = row.ordering === 1;
      deliveryDays[row.weekday] = row.delivery === 1;
    }
    return { orderingDays, deliveryDays };
  }

  putPreorderConfig(weekday: number, ordering: boolean, delivery: boolean): void {
    this.db
      .prepare(
        `INSERT INTO preorder_config (weekday, ordering, delivery) VALUES (?, ?, ?)
         ON CONFLICT(weekday) DO UPDATE SET ordering = excluded.ordering, delivery = excluded.delivery`,
      )
      .run(weekday, ordering ? 1 : 0, delivery ? 1 : 0);
  }
}
