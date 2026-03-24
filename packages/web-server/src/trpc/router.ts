import { router } from "./trpc.js";
import { meRouter } from "./routers/me.js";

export const appRouter = router({
  ...meRouter._def.procedures,
});

export type AppRouter = typeof appRouter;
