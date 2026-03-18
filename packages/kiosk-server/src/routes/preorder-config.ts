import { Hono } from "hono";
import type { Store } from "../db/store.js";

export function preorderConfigRoute(store: Store) {
  const app = new Hono();

  app.get("/", (c) => {
    const config = store.getPreorderConfig();
    return c.json(
      config ?? { orderingDays: Array(7).fill(true), deliveryDays: Array(7).fill(true) },
    );
  });

  return app;
}
