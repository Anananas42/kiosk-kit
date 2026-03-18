import type { HealthResponse } from "@kioskkit/shared";
import { Hono } from "hono";

export function healthRoute() {
  const app = new Hono();

  app.get("/", (c) => {
    const response: HealthResponse = { online: true, queued: 0 };
    return c.json(response);
  });

  return app;
}
