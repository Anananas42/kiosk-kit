import { Hono } from "hono";
import type { Store } from "../../db/store.js";

export function adminSettingsRoute(store: Store) {
  const app = new Hono();

  app.put("/", async (c) => {
    const body = await c.req.json();
    if (!body || typeof body !== "object") {
      return c.json({ error: "Invalid body" }, 400);
    }
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      store.putSetting(key, String(value));
    }
    return c.json({ ok: true });
  });

  return app;
}
