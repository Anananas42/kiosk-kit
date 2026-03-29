import {
  ConsumptionReportInputSchema,
  ConsumptionReportSchema,
  ConsumptionReportV2Schema,
  type ConsumptionSummaryRow,
  getDeliveryDate,
  noDeliveryDaysSet,
  PreorderReportSchema,
} from "@kioskkit/shared";
import { baseProcedure, router } from "../trpc.js";

export const reportsRouter = router({
  "reports.consumption": baseProcedure.output(ConsumptionReportSchema).query(({ ctx }) => {
    const records = ctx.store.getRecords();

    const agg = new Map<
      string,
      {
        item: string;
        itemId: string;
        category: string;
        quantity: string;
        price: string;
        byBuyer: Map<number, number>;
      }
    >();

    for (const r of records) {
      const key = r.itemId || r.item;
      let entry = agg.get(key);
      if (!entry) {
        entry = {
          item: r.item,
          itemId: r.itemId,
          category: r.category,
          quantity: r.quantity,
          price: r.price,
          byBuyer: new Map(),
        };
        agg.set(key, entry);
      }
      entry.byBuyer.set(r.buyer, (entry.byBuyer.get(r.buyer) ?? 0) + r.count);
    }

    const rows = Array.from(agg.values()).map((e) => ({
      item: e.item,
      itemId: e.itemId,
      category: e.category,
      quantity: e.quantity,
      price: e.price,
      byBuyer: Object.fromEntries(e.byBuyer),
    }));

    return { rows };
  }),

  "reports.consumptionV2": baseProcedure
    .input(ConsumptionReportInputSchema)
    .output(ConsumptionReportV2Schema)
    .query(({ ctx, input }) => {
      const rawSummary = ctx.store.getConsumptionSummary(input.from, input.to);
      const summary: ConsumptionSummaryRow[] = rawSummary.map((row) => ({
        ...row,
        byBuyer: JSON.parse(row.byBuyer) as Record<string, { count: number; total: number }>,
      }));
      const buyerTotals = ctx.store.getTotalsByBuyerAndTaxRate(input.from, input.to);
      return { summary, buyerTotals };
    }),

  "reports.preorders": baseProcedure.output(PreorderReportSchema).query(({ ctx }) => {
    const config = ctx.store.getPreorderConfig();
    const noDelivery = config ? noDeliveryDaysSet(config.deliveryDays) : new Set<number>();

    const records = ctx.store.getRecords();
    const catalog = ctx.store.getCatalog();
    const preorderCategories = new Set(
      catalog.filter((cat) => cat.preorder).map((cat) => cat.name),
    );

    const preorderRecords = records.filter((r) => preorderCategories.has(r.category));

    const byDate = new Map<string, Map<string, number>>();
    for (const r of preorderRecords) {
      const date = getDeliveryDate(r.timestamp, noDelivery);
      if (!date) continue;
      let dateMap = byDate.get(date);
      if (!dateMap) {
        dateMap = new Map();
        byDate.set(date, dateMap);
      }
      dateMap.set(r.item, (dateMap.get(r.item) ?? 0) + r.count);
    }

    const rows = Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, items]) => ({
        date,
        items: Object.fromEntries(items),
      }));

    return { rows };
  }),
});
