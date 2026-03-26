import { OtaDownloadInputSchema, OtaStatusSchema } from "@kioskkit/shared";
import { z } from "zod";
import { baseProcedure, router } from "../trpc.js";
import {
  cancelDownload,
  getOtaStatus,
  installAndReboot,
  rollbackAndReboot,
  startDownload,
} from "./ota.service.js";

const OkSchema = z.object({ ok: z.boolean() });

export const otaRouter = router({
  "admin.ota.status": baseProcedure.output(OtaStatusSchema).query(() => getOtaStatus()),

  "admin.ota.download": baseProcedure
    .input(OtaDownloadInputSchema)
    .output(OkSchema)
    .mutation(async ({ input }) => {
      await startDownload(input.url, input.version, input.sha256);
      return { ok: true };
    }),

  "admin.ota.install": baseProcedure.output(OkSchema).mutation(async () => {
    await installAndReboot();
    return { ok: true };
  }),

  "admin.ota.cancelDownload": baseProcedure.output(OkSchema).mutation(async () => {
    await cancelDownload();
    return { ok: true };
  }),

  "admin.ota.rollback": baseProcedure.output(OkSchema).mutation(async () => {
    await rollbackAndReboot();
    return { ok: true };
  }),
});
