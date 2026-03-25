import {
  WifiConnectRequestSchema,
  WifiForgetRequestSchema,
  WifiStatusSchema,
} from "@kioskkit/shared";
import { z } from "zod";
import { baseProcedure, router } from "../trpc.js";
import { connectToWifi, forgetWifi, getWifiStatus } from "./network.service.js";

const OkSchema = z.object({ ok: z.boolean() });

export const networkRouter = router({
  "admin.network.list": baseProcedure.output(WifiStatusSchema).query(() => getWifiStatus()),

  "admin.network.connect": baseProcedure
    .input(WifiConnectRequestSchema)
    .output(OkSchema)
    .mutation(async ({ input }) => {
      await connectToWifi(input.ssid, input.password);
      return { ok: true };
    }),

  "admin.network.forget": baseProcedure
    .input(WifiForgetRequestSchema)
    .output(OkSchema)
    .mutation(async ({ input }) => {
      await forgetWifi(input.ssid);
      return { ok: true };
    }),
});
