import { catalogRouter } from "./routers/catalog.js";
import { router } from "./trpc.js";

export const appRouter = router({
  ...catalogRouter._def.procedures,
});

export type AppRouter = typeof appRouter;
