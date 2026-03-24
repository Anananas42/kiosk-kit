import { CatalogListOutputSchema } from "@kioskkit/shared";
import { baseProcedure, router } from "../trpc.js";

export const catalogRouter = router({
  "catalog.list": baseProcedure.output(CatalogListOutputSchema).query(({ ctx }) => {
    return ctx.store.getCatalog();
  }),
});
