import {
  WifiConnectRequestSchema,
  WifiForgetRequestSchema,
  WifiStatusSchema,
} from "@kioskkit/shared";
import { z } from "zod";
import { baseProcedure, router } from "../trpc.js";

const OkSchema = z.object({ ok: z.boolean() });

export const networkRouter = router({
  "admin.network.list": baseProcedure.output(WifiStatusSchema).query(() => {
    // TODO: implement OS-level network scanning (e.g. via NetworkManager D-Bus)
    return {
      current: null,
      ethernet: false,
      saved: [],
      available: [],
    };
  }),

  "admin.network.connect": baseProcedure
    .input(WifiConnectRequestSchema)
    .output(OkSchema)
    .mutation(({ input: _input }) => {
      // TODO: implement OS-level network connection
      return { ok: true };
    }),

  "admin.network.forget": baseProcedure
    .input(WifiForgetRequestSchema)
    .output(OkSchema)
    .mutation(({ input: _input }) => {
      // TODO: implement OS-level network forget
      return { ok: true };
    }),
});
