import { backupsRouter } from "./routers/backups.js";
import { devicesRouter } from "./routers/devices.js";
import { meRouter } from "./routers/me.js";
import { usersRouter } from "./routers/users.js";
import { router } from "./trpc.js";

export const appRouter = router({
  ...meRouter._def.procedures,
  ...devicesRouter._def.procedures,
  ...usersRouter._def.procedures,
  ...backupsRouter._def.procedures,
});

export type AppRouter = typeof appRouter;
