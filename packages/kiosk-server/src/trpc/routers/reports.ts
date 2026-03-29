import {
  ConsumptionReportInputSchema,
  ConsumptionReportSchema,
  type ConsumptionSummaryRow,
  getDeliveryDate,
  noDeliveryDaysSet,
  PreorderReportSchema,
} from "@kioskkit/shared";
import { baseProcedure, router } from "../trpc.js";

export const reportsRouter = router({
  "reports.consumption": baseProcedure
    .input(ConsumptionReportInputSchema)
    .output(ConsumptionReportSchema)
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
