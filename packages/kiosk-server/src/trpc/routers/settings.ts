import {
  DEFAULT_KIOSK_SETTINGS,
  DEFAULT_PREORDER_CONFIG,
  KioskSettingsSchema,
  PreorderConfigSchema,
} from "@kioskkit/shared";
import { baseProcedure, router } from "../trpc.js";

export const settingsRouter = router({
  "settings.get": baseProcedure.output(KioskSettingsSchema).query(({ ctx }) => {
    return ctx.store.getSettings() ?? DEFAULT_KIOSK_SETTINGS;
  }),

  "preorderConfig.get": baseProcedure.output(PreorderConfigSchema).query(({ ctx }) => {
    return ctx.store.getPreorderConfig() ?? DEFAULT_PREORDER_CONFIG;
  }),

  "backup.status": baseProcedure.query(({ ctx }) => {
    return { lastBackupAt: ctx.store.getSetting("lastBackupAt") };
  }),
});
