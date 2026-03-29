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
        sortOrder: cat.sortOrder,
        items: items.map(
          (it): CatalogItem => ({
            id: String(it.id),
            name: it.name,
            quantity: it.quantity,
            price: it.price,
            taxRate: it.taxRate,
            sortOrder: it.sortOrder,
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

  moveCategory(id: number, direction: "up" | "down"): void {
    const current = this.db
      .select({ id: catalogCategories.id, sortOrder: catalogCategories.sortOrder })
      .from(catalogCategories)
      .where(eq(catalogCategories.id, id))
      .get();
    if (!current) throw new Error("Category not found");

    const adjacent = this.db
      .select({ id: catalogCategories.id, sortOrder: catalogCategories.sortOrder })
      .from(catalogCategories)
      .where(
        direction === "up"
          ? sql`(${catalogCategories.sortOrder} < ${current.sortOrder}) OR (${catalogCategories.sortOrder} = ${current.sortOrder} AND ${catalogCategories.id} < ${current.id})`
          : sql`(${catalogCategories.sortOrder} > ${current.sortOrder}) OR (${catalogCategories.sortOrder} = ${current.sortOrder} AND ${catalogCategories.id} > ${current.id})`,
      )
      .orderBy(
        direction === "up"
          ? sql`${catalogCategories.sortOrder} DESC, ${catalogCategories.id} DESC`
          : sql`${catalogCategories.sortOrder} ASC, ${catalogCategories.id} ASC`,
      )
      .limit(1)
      .get();
    if (!adjacent) return;

    if (current.sortOrder === adjacent.sortOrder) {
      // Equal sort orders — assign distinct values so the move is visible
      const lo = direction === "up" ? current.id : adjacent.id;
      const hi = direction === "up" ? adjacent.id : current.id;
      this.db
        .update(catalogCategories)
        .set({ sortOrder: current.sortOrder })
        .where(eq(catalogCategories.id, lo))
        .run();
      this.db
        .update(catalogCategories)
        .set({ sortOrder: current.sortOrder + 1 })
        .where(eq(catalogCategories.id, hi))
        .run();
    } else {
      this.db
        .update(catalogCategories)
        .set({ sortOrder: adjacent.sortOrder })
        .where(eq(catalogCategories.id, current.id))
        .run();
      this.db
        .update(catalogCategories)
        .set({ sortOrder: current.sortOrder })
        .where(eq(catalogCategories.id, adjacent.id))
        .run();
    }
  }

  deleteCategory(id: number): void {
    this.db.delete(catalogCategories).where(eq(catalogCategories.id, id)).run();
  }

  createItem(
    categoryId: number,
    name: string,
    quantity: string,
    price: string,
    taxRate: string,
    sortOrder: number,
  ): number {
    const result = this.db
      .insert(catalogItems)
      .values({ categoryId, name, quantity, price, taxRate, sortOrder })
      .returning({ id: catalogItems.id })
      .get();
    return result.id;
  }

  updateItem(
    id: number,
    name: string,
    quantity: string,
    price: string,
    taxRate: string,
    sortOrder: number,
  ): void {
    this.db
      .update(catalogItems)
      .set({ name, quantity, price, taxRate, sortOrder })
      .where(eq(catalogItems.id, id))
      .run();
  }

  moveItem(id: number, direction: "up" | "down"): void {
    const current = this.db
      .select({
        id: catalogItems.id,
        categoryId: catalogItems.categoryId,
        sortOrder: catalogItems.sortOrder,
      })
      .from(catalogItems)
      .where(eq(catalogItems.id, id))
      .get();
    if (!current) throw new Error("Item not found");

    const adjacent = this.db
      .select({ id: catalogItems.id, sortOrder: catalogItems.sortOrder })
      .from(catalogItems)
      .where(
        direction === "up"
          ? sql`${catalogItems.categoryId} = ${current.categoryId} AND ((${catalogItems.sortOrder} < ${current.sortOrder}) OR (${catalogItems.sortOrder} = ${current.sortOrder} AND ${catalogItems.id} < ${current.id}))`
          : sql`${catalogItems.categoryId} = ${current.categoryId} AND ((${catalogItems.sortOrder} > ${current.sortOrder}) OR (${catalogItems.sortOrder} = ${current.sortOrder} AND ${catalogItems.id} > ${current.id}))`,
      )
      .orderBy(
        direction === "up"
          ? sql`${catalogItems.sortOrder} DESC, ${catalogItems.id} DESC`
          : sql`${catalogItems.sortOrder} ASC, ${catalogItems.id} ASC`,
      )
      .limit(1)
      .get();
    if (!adjacent) return;

    if (current.sortOrder === adjacent.sortOrder) {
      const lo = direction === "up" ? current.id : adjacent.id;
      const hi = direction === "up" ? adjacent.id : current.id;
      this.db
        .update(catalogItems)
        .set({ sortOrder: current.sortOrder })
        .where(eq(catalogItems.id, lo))
        .run();
      this.db
        .update(catalogItems)
        .set({ sortOrder: current.sortOrder + 1 })
        .where(eq(catalogItems.id, hi))
        .run();
    } else {
      this.db
        .update(catalogItems)
        .set({ sortOrder: adjacent.sortOrder })
        .where(eq(catalogItems.id, current.id))
        .run();
      this.db
        .update(catalogItems)
        .set({ sortOrder: current.sortOrder })
        .where(eq(catalogItems.id, adjacent.id))
        .run();
    }
  }

  deleteItem(id: number): void {
    this.db.delete(catalogItems).where(eq(catalogItems.id, id)).run();
  }

  getCatalogItemTaxRate(itemId: string, itemName: string): string {
    if (itemId) {
      const row = this.db
        .select({ taxRate: catalogItems.taxRate })
        .from(catalogItems)
        .where(eq(catalogItems.id, Number(itemId)))
        .get();
      if (row) return row.taxRate;
    }
    const row = this.db
      .select({ taxRate: catalogItems.taxRate })
      .from(catalogItems)
      .where(eq(catalogItems.name, itemName))
      .get();
    return row?.taxRate ?? "";
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

  private get recordColumns() {
    return {
      timestamp: records.timestamp,
      buyer: records.buyer,
      count: records.count,
      category: records.category,
      item: records.item,
      itemId: records.itemId,
      quantity: records.quantity,
      price: records.price,
      taxRate: records.taxRate,
    } as const;
  }

  getRecords(opts?: { from?: string; to?: string }): RecordRow[] {
    const conditions = [];
    if (opts?.from) conditions.push(sql`${records.timestamp} >= ${opts.from}`);
    if (opts?.to) conditions.push(sql`${records.timestamp} < ${opts.to}`);

    return this.db
      .select(this.recordColumns)
      .from(records)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(sql`${records.timestamp} DESC`)
      .all();
  }

  getRecordsByBuyer(buyer: number, opts?: { from?: string; to?: string }): RecordRow[] {
    const conditions = [eq(records.buyer, buyer)];
    if (opts?.from) conditions.push(sql`${records.timestamp} >= ${opts.from}`);
    if (opts?.to) conditions.push(sql`${records.timestamp} < ${opts.to}`);

    return this.db
      .select(this.recordColumns)
      .from(records)
      .where(and(...conditions))
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

    return this.db.select(this.recordColumns).from(records).where(condition).all();
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
        taxRate: entry.taxRate,
      })
      .run();
  }

  // ── Consumption Report ─────────────────────────────────────────────────

  getConsumptionSummary(
    from: string,
    to?: string,
  ): Array<{
    itemKey: string;
    item: string;
    itemId: string;
    category: string;
    quantity: string;
    taxRate: string;
    byBuyer: string;
    totalCount: number;
    grandTotal: number;
    unitPrice: number | null;
  }> {
    const stmt = this.db.all(sql`
      WITH item_buyer AS (
        SELECT
          COALESCE(NULLIF(${records.itemId}, ''), ${records.item}) AS item_key,
          ${records.item} AS item,
          ${records.itemId} AS itemId,
          ${records.category} AS category,
          ${records.quantity} AS quantity,
          ${records.taxRate} AS taxRate,
          ${records.buyer} AS buyer,
          SUM(${records.count})               AS net_count,
          SUM(CAST(${records.price} AS REAL)) AS net_total
        FROM ${records}
        WHERE ${records.timestamp} >= ${from}
          AND (${to ?? null} IS NULL OR ${records.timestamp} < ${to ?? null})
        GROUP BY item_key, buyer
      )
      SELECT
        item_key,
        item,
        itemId,
        category,
        quantity,
        taxRate,
        json_group_object(
          CAST(buyer AS TEXT),
          json_object('count', net_count, 'total', net_total)
        ) AS by_buyer,
        SUM(net_count)  AS total_count,
        SUM(net_total)  AS grand_total,
        CASE WHEN SUM(net_count) != 0
          THEN SUM(net_total) / SUM(net_count)
          ELSE NULL
        END AS unit_price
      FROM item_buyer
      GROUP BY item_key
    `);
    return (stmt as Array<Record<string, unknown>>).map((row) => ({
      itemKey: row.item_key as string,
      item: row.item as string,
      itemId: row.itemId as string,
      category: row.category as string,
      quantity: row.quantity as string,
      taxRate: row.taxRate as string,
      byBuyer: row.by_buyer as string,
      totalCount: row.total_count as number,
      grandTotal: row.grand_total as number,
      unitPrice: row.unit_price as number | null,
    }));
  }

  getTotalsByBuyerAndTaxRate(
    from: string,
    to?: string,
  ): Array<{
    buyer: number;
    taxRate: string;
    netCount: number;
    netTotal: number;
  }> {
    const stmt = this.db.all(sql`
      SELECT
        ${records.buyer} AS buyer,
        ${records.taxRate} AS tax_rate,
        SUM(${records.count})               AS net_count,
        SUM(CAST(${records.price} AS REAL)) AS net_total
      FROM ${records}
      WHERE ${records.timestamp} >= ${from}
        AND (${to ?? null} IS NULL OR ${records.timestamp} < ${to ?? null})
      GROUP BY ${records.buyer}, ${records.taxRate}
    `);
    return (stmt as Array<Record<string, unknown>>).map((row) => ({
      buyer: row.buyer as number,
      taxRate: row.tax_rate as string,
      netCount: row.net_count as number,
      netTotal: row.net_total as number,
    }));
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
