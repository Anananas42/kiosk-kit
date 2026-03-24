import { randomUUID } from "node:crypto";
import {
  ItemCountInputSchema,
  ItemCountResponseSchema,
  OverviewResponseSchema,
  RecordRequestSchema,
  type RecordEntry,
} from "@kioskkit/shared";
import { z } from "zod";
import { withLock } from "../../lock.js";
import { baseProcedure, router } from "../trpc.js";

export const recordsRouter = router({
  "records.submit": baseProcedure
    .input(RecordRequestSchema)
    .output(z.object({ ok: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return withLock(async () => {
        if (input.count < 0) {
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

  "records.list": baseProcedure.output(OverviewResponseSchema).query(({ ctx }) => {
    return { records: ctx.store.getRecords() };
  }),

  "records.itemCount": baseProcedure
    .input(ItemCountInputSchema)
    .output(ItemCountResponseSchema)
    .query(({ ctx, input }) => {
      const total = ctx.store.getItemBalance(input.buyer, input.item, input.itemId);
      return { count: total };
    }),
});
