import { adminRouter } from "./routers/admin.js";
import { buyersRouter } from "./routers/buyers.js";
import { catalogRouter } from "./routers/catalog.js";
import { recordsRouter } from "./routers/records.js";
import { reportsRouter } from "./routers/reports.js";
import { settingsRouter } from "./routers/settings.js";
import { router } from "./trpc.js";

export const appRouter = router({
  ...catalogRouter._def.procedures,
  ...buyersRouter._def.procedures,
  ...recordsRouter._def.procedures,
  ...settingsRouter._def.procedures,
  ...reportsRouter._def.procedures,
  ...adminRouter._def.procedures,
});

export type AppRouter = typeof appRouter;
