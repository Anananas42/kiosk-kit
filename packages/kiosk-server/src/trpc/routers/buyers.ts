import { BuyersResponseSchema } from "@kioskkit/shared";
import { baseProcedure, router } from "../trpc.js";

export const buyersRouter = router({
  "buyers.list": baseProcedure.output(BuyersResponseSchema).query(({ ctx }) => {
    return { buyers: ctx.store.getBuyers() };
  }),
});
