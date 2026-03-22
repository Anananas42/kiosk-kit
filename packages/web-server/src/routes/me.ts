import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import { validateSession } from "../auth/session.js";
import type { Db } from "../db/index.js";

const MeResponseSchema = z.object({
  user: z
    .object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
      role: z.string(),
    })
    .nullable(),
});

export function meRoute(db: Db) {
  const app = new Hono();

  app.get(
    "/",
    describeRoute({
      tags: ["User"],
      summary: "Get current user",
      description: "Returns the authenticated user, or null if not logged in.",
      responses: {
        200: {
          description: "Current user info",
          content: {
            "application/json": { schema: resolver(MeResponseSchema) },
          },
        },
      },
    }),
    async (c) => {
      const header = c.req.header("cookie");
      const match = header?.match(/(?:^|;\s*)session=([^;]*)/);
      const sessionId = match?.[1];

      if (!sessionId) return c.json({ user: null });

      const result = await validateSession(db, sessionId);
      if (!result) return c.json({ user: null });

      return c.json({
        user: {
          id: result.user.id,
          name: result.user.name,
          email: result.user.email,
          role: result.user.role,
        },
      });
    },
  );

  return app;
}
