import type { KioskSettings } from "@kioskkit/shared";
import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Store } from "../../db/store.js";

const VALID_SETTING_KEYS: ReadonlySet<string> = new Set<keyof KioskSettings>([
  "idleDimMs",
  "inactivityTimeoutMs",
  "maintenance",
  "locale",
  "currency",
  "buyerNoun",
]);

export function adminSettingsRoute(store: Store) {
  const app = new Hono();

  app.put(
    "/",
    describeRoute({
      tags: ["Admin"],
      summary: "Update kiosk settings",
      description: "Update one or more kiosk settings by key.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object" as const,
              properties: {
                idleDimMs: { type: "number" as const },
                inactivityTimeoutMs: { type: "number" as const },
                maintenance: { type: "boolean" as const },
                locale: { type: "string" as const },
                currency: { type: "string" as const },
                buyerNoun: { type: "string" as const },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: "Settings updated",
          content: {
            "application/json": { schema: resolver(z.object({ ok: z.boolean() })) },
          },
        },
        400: {
          description: "Invalid setting keys",
          content: {
            "application/json": { schema: resolver(z.object({ error: z.string() })) },
          },
        },
      },
    }),
    async (c) => {
      const body = await c.req.json();
      if (!body || typeof body !== "object") {
        return c.json({ error: "Invalid body" }, 400);
      }
      const invalidKeys = Object.keys(body as Record<string, unknown>).filter(
        (k) => !VALID_SETTING_KEYS.has(k),
      );
      if (invalidKeys.length > 0) {
        return c.json({ error: `Invalid setting keys: ${invalidKeys.join(", ")}` }, 400);
      }
      for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
        store.putSetting(key, String(value));
      }
      return c.json({ ok: true });
    },
  );

  return app;
}
