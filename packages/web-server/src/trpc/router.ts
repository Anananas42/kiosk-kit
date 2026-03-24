import { router } from "./trpc.js";
import { devicesRouter } from "./routers/devices.js";
import { meRouter } from "./routers/me.js";
import { usersRouter } from "./routers/users.js";

export const appRouter = router({
  ...meRouter._def.procedures,
  ...devicesRouter._def.procedures,
  ...usersRouter._def.procedures,
});

export type AppRouter = typeof appRouter;
