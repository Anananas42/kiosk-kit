import { Hono } from "hono";
import { validateSession } from "../auth/session.js";
import type { Db } from "../db/index.js";

export function meRoute(db: Db) {
  const app = new Hono();

  app.get("/", async (c) => {
    const header = c.req.header("cookie");
    const match = header?.match(/(?:^|;\s*)session=([^;]*)/);
    const sessionId = match?.[1];

    if (!sessionId) return c.json({ user: null });

    const result = await validateSession(db, sessionId);
    if (!result) return c.json({ user: null });

    return c.json({
      user: { id: result.user.id, name: result.user.name, email: result.user.email },
    });
  });

  return app;
}
