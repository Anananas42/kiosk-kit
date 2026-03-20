import { Hono } from "hono";

export function healthRoute() {
  const app = new Hono();

  app.get("/", (c) => c.body(null, 204));

  return app;
}
