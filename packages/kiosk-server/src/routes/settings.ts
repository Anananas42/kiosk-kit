import { DEFAULT_KIOSK_SETTINGS } from "@kioskkit/shared";
import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Store } from "../db/store.js";

const KioskSettingsSchema = z.object({
  idleDimMs: z.number(),
  inactivityTimeoutMs: z.number(),
  maintenance: z.boolean(),
  locale: z.string(),
  currency: z.string(),
  buyerNoun: z.string(),
});

export function settingsRoute(store: Store) {
  const app = new Hono();

  app.get(
    "/",
    describeRoute({
      tags: ["Touchscreen"],
      summary: "Get kiosk settings",
      description: "Returns the current kiosk display and behavior settings.",
      responses: {
        200: {
          description: "Kiosk settings",
          content: {
            "application/json": { schema: resolver(KioskSettingsSchema) },
          },
        },
      },
    }),
    (c) => {
      const settings = store.getSettings();
      return c.json(settings ?? DEFAULT_KIOSK_SETTINGS);
    },
  );

  return app;
}
