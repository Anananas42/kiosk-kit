import type {
  Buyer,
  CatalogCategory,
  CatalogItem,
  KioskSettings,
  PreorderConfig,
  RecordEntry,
  RecordRow,
} from "@kioskkit/shared";
import { and, eq, or, sql } from "drizzle-orm";
import type { Db } from "./index.js";
import {
  buyers,
  catalogCategories,
  catalogItems,
  preorderConfig,
  records,
  settings,
} from "./schema.js";

export class Store {
  constructor(private db: Db) {}

  // ── Buyers ────────────────────────────────────────────────────────────

  getBuyers(): Buyer[] {
    return this.db.select().from(buyers).orderBy(buyers.id).all();
  }

  createBuyer(id: number, label: string): void {
    this.db.insert(buyers).values({ id, label }).run();
  }

  updateBuyer(id: number, label: string): void {
    this.db.update(buyers).set({ label }).where(eq(buyers.id, id)).run();
  }

  deleteBuyer(id: number): void {
    this.db.delete(buyers).where(eq(buyers.id, id)).run();
  }

  // ── Catalog ─────────────────────────────────────────────────────────────

  getCatalog(): CatalogCategory[] {
    const cats = this.db
      .select()
      .from(catalogCategories)
      .orderBy(catalogCategories.sortOrder, catalogCategories.id)
      .all();

    return cats.map((cat) => {
      const items = this.db
        .select()
        .from(catalogItems)
        .where(eq(catalogItems.categoryId, cat.id))
        .orderBy(catalogItems.sortOrder, catalogItems.id)
        .all();

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
            dphRate: it.dphRate,
          }),
        ),
      };
    });
  }

  createCategory(name: string, preorder: boolean, sortOrder: number): number {
    const result = this.db
      .insert(catalogCategories)
      .values({ name, preorder: preorder ? 1 : 0, sortOrder })
      .returning({ id: catalogCategories.id })
      .get();
    return result.id;
  }

  updateCategory(id: number, name: string, preorder: boolean, sortOrder: number): void {
    this.db
      .update(catalogCategories)
      .set({ name, preorder: preorder ? 1 : 0, sortOrder })
      .where(eq(catalogCategories.id, id))
      .run();
  }

  deleteCategory(id: number): void {
    this.db.delete(catalogCategories).where(eq(catalogCategories.id, id)).run();
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
      .insert(catalogItems)
      .values({ categoryId, name, quantity, price, dphRate, sortOrder })
      .returning({ id: catalogItems.id })
      .get();
    return result.id;
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
      .update(catalogItems)
      .set({ name, quantity, price, dphRate, sortOrder })
      .where(eq(catalogItems.id, id))
      .run();
  }

  deleteItem(id: number): void {
    this.db.delete(catalogItems).where(eq(catalogItems.id, id)).run();
  }

  isCategoryPreorder(categoryName: string): boolean {
    const row = this.db
      .select({ preorder: catalogCategories.preorder })
      .from(catalogCategories)
      .where(eq(catalogCategories.name, categoryName))
      .get();
    return row?.preorder === 1;
  }

  // ── Records ─────────────────────────────────────────────────────────────

  getRecords(): RecordRow[] {
    return this.db
      .select({
        timestamp: records.timestamp,
        buyer: records.buyer,
        count: records.count,
        category: records.category,
        item: records.item,
        itemId: records.itemId,
        quantity: records.quantity,
        price: records.price,
      })
      .from(records)
      .orderBy(sql`${records.timestamp} DESC`)
      .all();
  }

  getRecordsByBuyer(buyer: number): RecordRow[] {
    return this.db
      .select({
        timestamp: records.timestamp,
        buyer: records.buyer,
        count: records.count,
        category: records.category,
        item: records.item,
        itemId: records.itemId,
        quantity: records.quantity,
        price: records.price,
      })
      .from(records)
      .where(eq(records.buyer, buyer))
      .orderBy(sql`${records.timestamp} DESC`)
      .all();
  }

  getRecordsForItem(buyer: number, item: string, itemId?: string): RecordRow[] {
    const condition = itemId
      ? and(
          eq(records.buyer, buyer),
          or(eq(records.itemId, itemId), and(eq(records.itemId, ""), eq(records.item, item))),
        )
      : and(eq(records.buyer, buyer), eq(records.item, item));

    return this.db
      .select({
        timestamp: records.timestamp,
        buyer: records.buyer,
        count: records.count,
        category: records.category,
        item: records.item,
        itemId: records.itemId,
        quantity: records.quantity,
        price: records.price,
      })
      .from(records)
      .where(condition)
      .all();
  }

  getItemBalance(buyer: number, item: string, itemId?: string): number {
    if (itemId) {
      const row = this.db
        .select({ total: sql<number>`COALESCE(SUM(${records.count}), 0)` })
        .from(records)
        .where(
          and(
            eq(records.buyer, buyer),
            or(eq(records.itemId, itemId), and(eq(records.itemId, ""), eq(records.item, item))),
          ),
        )
        .get();
      return row?.total ?? 0;
    }
    const row = this.db
      .select({ total: sql<number>`COALESCE(SUM(${records.count}), 0)` })
      .from(records)
      .where(and(eq(records.buyer, buyer), eq(records.item, item)))
      .get();
    return row?.total ?? 0;
  }

  insertRecord(entry: RecordEntry): void {
    this.db
      .insert(records)
      .values({
        id: entry.id,
        timestamp: entry.timestamp,
        buyer: entry.buyer,
        count: entry.count,
        category: entry.category,
        item: entry.item,
        itemId: entry.itemId,
        quantity: entry.quantity,
        price: entry.price,
      })
      .run();
  }

  // ── Settings ────────────────────────────────────────────────────────────

  getSettings(): KioskSettings | null {
    const rows = this.db.select().from(settings).all();
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

  getSetting(key: string): string | null {
    const row = this.db.select().from(settings).where(eq(settings.key, key)).get();
    return row?.value ?? null;
  }

  putSetting(key: string, value: string): void {
    this.db
      .insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value } })
      .run();
  }

  // ── Preorder Config ───────────────────────────────────────────────────────

  getPreorderConfig(): PreorderConfig | null {
    const rows = this.db.select().from(preorderConfig).orderBy(preorderConfig.weekday).all();
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
      .insert(preorderConfig)
      .values({ weekday, ordering: ordering ? 1 : 0, delivery: delivery ? 1 : 0 })
      .onConflictDoUpdate({
        target: preorderConfig.weekday,
        set: { ordering: ordering ? 1 : 0, delivery: delivery ? 1 : 0 },
      })
      .run();
  }
}
