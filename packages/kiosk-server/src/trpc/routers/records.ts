import { randomUUID } from "node:crypto";
import {
  getDeliveryDate,
  ItemCountInputSchema,
  ItemCountResponseSchema,
  noDeliveryDaysSet,
  OverviewResponseSchema,
  type RecordEntry,
  RecordRequestSchema,
  type RecordRow,
  TZ,
} from "@kioskkit/shared";
import { z } from "zod";
import { withLock } from "../../lock.js";
import { baseProcedure, router } from "../trpc.js";

function getTodayString(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getCancellableBalance(
  recs: RecordRow[],
  noDeliveryDays: Set<number>,
  today: string,
): number {
  let sum = 0;
  for (const r of recs) {
    const dd = getDeliveryDate(r.timestamp, noDeliveryDays);
    if (dd && dd >= today) {
      sum += r.count;
    }
  }
  return sum;
}

export const recordsRouter = router({
  "records.submit": baseProcedure
    .input(RecordRequestSchema)
    .output(z.object({ ok: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return withLock(async () => {
        if (input.count < 0) {
          if (ctx.store.isCategoryPreorder(input.category)) {
            const config = ctx.store.getPreorderConfig();
            const noDD = config ? noDeliveryDaysSet(config.deliveryDays) : new Set<number>();
            const recs = ctx.store.getRecordsForItem(input.buyer, input.item, input.itemId);
            const today = getTodayString();
            const cancellable = getCancellableBalance(recs, noDD, today);
            if (cancellable + input.count < 0) {
              throw new Error("delivery_passed");
            }
          }

          const balance = ctx.store.getItemBalance(input.buyer, input.item, input.itemId);
          if (balance + input.count < 0) {
            throw new Error("insufficient_balance");
          }
        }

        const entry: RecordEntry = {
          id: randomUUID(),
          timestamp: new Date().toISOString(),
          buyer: input.buyer,
          count: input.count,
          category: input.category,
          item: input.item,
          itemId: input.itemId ?? "",
          quantity: input.quantity ?? "",
          price: input.price ?? "",
        };

        ctx.store.insertRecord(entry);
        return { ok: true };
      });
    }),

  "records.list": baseProcedure
    .input(z.object({ buyer: z.number().int().min(1) }).optional())
    .output(OverviewResponseSchema)
    .query(({ ctx, input }) => {
      const records = input?.buyer
        ? ctx.store.getRecordsByBuyer(input.buyer)
        : ctx.store.getRecords();
      return { records };
    }),

  "records.itemCount": baseProcedure
    .input(ItemCountInputSchema)
    .output(ItemCountResponseSchema)
    .query(({ ctx, input }) => {
      if (input.preorder) {
        const config = ctx.store.getPreorderConfig();
        const noDD = config ? noDeliveryDaysSet(config.deliveryDays) : new Set<number>();
        const recs = ctx.store.getRecordsForItem(input.buyer, input.item, input.itemId);
        const today = getTodayString();
        const cancellable = getCancellableBalance(recs, noDD, today);
        return { count: cancellable };
      }
      const total = ctx.store.getItemBalance(input.buyer, input.item, input.itemId);
      return { count: total };
    }),
});
