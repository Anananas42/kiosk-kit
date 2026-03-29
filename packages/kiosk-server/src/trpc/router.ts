import { adminRouter } from "./routers/admin.js";
import { appUpdateRouter } from "./routers/app-update.js";
import { buyersRouter } from "./routers/buyers.js";
import { catalogRouter } from "./routers/catalog.js";
import { networkRouter } from "./routers/network.js";
import { otaRouter } from "./routers/ota.js";
import { recordsRouter } from "./routers/records.js";
import { reportsRouter } from "./routers/reports.js";
import { settingsRouter } from "./routers/settings.js";
import { updateRouter } from "./routers/update.js";
import { router } from "./trpc.js";

export const appRouter = router({
  ...catalogRouter._def.procedures,
  ...buyersRouter._def.procedures,
  ...recordsRouter._def.procedures,
  ...settingsRouter._def.procedures,
  ...reportsRouter._def.procedures,
  ...adminRouter._def.procedures,
  ...networkRouter._def.procedures,
  ...otaRouter._def.procedures,
  ...appUpdateRouter._def.procedures,
  ...updateRouter._def.procedures,
});

export type AppRouter = typeof appRouter;
