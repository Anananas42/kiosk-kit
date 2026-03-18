import { createMiddleware } from "hono/factory";
import { validateSession } from "../auth/session.js";
import type { Db } from "../db/index.js";
import type { sessions, users } from "../db/schema.js";

type User = typeof users.$inferSelect;
type Session = typeof sessions.$inferSelect;

export type AuthEnv = {
  Variables: {
    user: User;
    session: Session;
  };
};

export function authMiddleware(db: Db) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const sessionId = getCookie(c, "session");
    if (!sessionId) return c.json({ error: "Unauthorized" }, 401);

    const result = await validateSession(db, sessionId);
    if (!result) return c.json({ error: "Unauthorized" }, 401);

    c.set("user", result.user);
    c.set("session", result.session);
    await next();
  });
}

function getCookie(c: { req: { header: (name: string) => string | undefined } }, name: string) {
  const header = c.req.header("cookie");
  if (!header) return undefined;
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match?.[1];
}
