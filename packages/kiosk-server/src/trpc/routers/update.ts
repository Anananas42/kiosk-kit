import { type UpdateResult, UpdateStatusSchema, type UpdateStep } from "@kioskkit/shared";
import { z } from "zod";
import { APP_VERSION_FILE } from "../../lib/app-update-constants.js";
import { readTextFile } from "../../lib/app-update-helpers.js";
import { baseProcedure, router } from "../trpc.js";
import { cancelUpload, getAppUpdateStatus, installApp } from "./app-update.service.js";

const OkSchema = z.object({ ok: z.boolean() });

export const updateRouter = router({
  "admin.update.status": baseProcedure.output(UpdateStatusSchema).query(async () => {
    const currentVersion = await readTextFile(APP_VERSION_FILE);
    const appStatus = await getAppUpdateStatus();

    return {
      currentVersion: currentVersion ?? appStatus.currentVersion,
      status: appStatus.status as unknown as UpdateStep,
      upload: appStatus.upload,
      lastResult: appStatus.lastResult as unknown as UpdateResult | null,
      rollbackAvailable: appStatus.rollbackAvailable,
    };
  }),

  "admin.update.install": baseProcedure.output(OkSchema).mutation(async () => {
    await installApp();
    return { ok: true };
  }),

  "admin.update.cancel": baseProcedure.output(OkSchema).mutation(async () => {
    await cancelUpload();
    return { ok: true };
  }),
});
