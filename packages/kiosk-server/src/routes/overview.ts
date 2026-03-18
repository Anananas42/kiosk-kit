import type { OverviewResponse } from "@kioskkit/shared";
import { Hono } from "hono";
import type { Store } from "../db/store.js";

export function overviewRoute(store: Store) {
  const app = new Hono();

  app.get("/", (c) => {
    const records = store.getRecords();
    const response: OverviewResponse = { records };
    return c.json(response);
  });

  return app;
}
