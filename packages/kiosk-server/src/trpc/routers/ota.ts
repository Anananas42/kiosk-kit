import { OtaStatusSchema } from "@kioskkit/shared";
import { z } from "zod";
import { baseProcedure, router } from "../trpc.js";
import { cancelUpload, getOtaStatus, installAndReboot, rollbackAndReboot } from "./ota.service.js";

const OkSchema = z.object({ ok: z.boolean() });

export const otaRouter = router({
  "admin.ota.status": baseProcedure.output(OtaStatusSchema).query(() => getOtaStatus()),

  "admin.ota.install": baseProcedure.output(OkSchema).mutation(async () => {
    await installAndReboot();
    return { ok: true };
  }),

  "admin.ota.cancelUpload": baseProcedure.output(OkSchema).mutation(async () => {
    await cancelUpload();
    return { ok: true };
  }),

  "admin.ota.rollback": baseProcedure.output(OkSchema).mutation(async () => {
    await rollbackAndReboot();
    return { ok: true };
  }),
});
