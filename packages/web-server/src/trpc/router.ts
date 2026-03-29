import { adminBackupsRouter } from "./routers/admin-backups.js";
import { adminDevicesRouter } from "./routers/admin-devices.js";
import { adminReleasesRouter } from "./routers/admin-releases.js";
import { adminUsersRouter } from "./routers/admin-users.js";
import { backupsRouter } from "./routers/backups.js";
import { deviceUpdateRouter } from "./routers/device-update.js";
import { devicesRouter } from "./routers/devices.js";
import { meRouter } from "./routers/me.js";
import { releasesRouter } from "./routers/releases.js";
import { router } from "./trpc.js";

export const appRouter = router({
  ...meRouter._def.procedures,
  ...devicesRouter._def.procedures,
  ...backupsRouter._def.procedures,
  ...releasesRouter._def.procedures,
});

export const adminRouter = router({
  ...meRouter._def.procedures,
  ...devicesRouter._def.procedures,
  ...adminDevicesRouter._def.procedures,
  ...adminUsersRouter._def.procedures,
  ...adminBackupsRouter._def.procedures,
  ...backupsRouter._def.procedures,
  ...adminReleasesRouter._def.procedures,
  ...releasesRouter._def.procedures,
  ...deviceUpdateRouter._def.procedures,
});

export type AppRouter = typeof appRouter;
export type AdminRouter = typeof adminRouter;
