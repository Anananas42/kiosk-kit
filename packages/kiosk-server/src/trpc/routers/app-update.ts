import { AppUpdateStatusSchema } from "@kioskkit/shared";
import { z } from "zod";
import { baseProcedure, router } from "../trpc.js";
import { cancelUpload, getAppUpdateStatus, installApp, rollbackApp } from "./app-update.service.js";

const OkSchema = z.object({ ok: z.boolean() });

export const appUpdateRouter = router({
  "admin.appUpdate.status": baseProcedure
    .output(AppUpdateStatusSchema)
    .query(() => getAppUpdateStatus()),

  "admin.appUpdate.install": baseProcedure.output(OkSchema).mutation(async () => {
    await installApp();
    return { ok: true };
  }),

  "admin.appUpdate.cancelUpload": baseProcedure.output(OkSchema).mutation(async () => {
    await cancelUpload();
    return { ok: true };
  }),

  "admin.appUpdate.rollback": baseProcedure.output(OkSchema).mutation(async () => {
    await rollbackApp();
    return { ok: true };
  }),
});
