import { DEFAULT_PREORDER_CONFIG } from "@kioskkit/shared";
import { Hono } from "hono";
import type { Store } from "../db/store.js";

export function preorderConfigRoute(store: Store) {
  const app = new Hono();

  app.get("/", (c) => {
    const config = store.getPreorderConfig();
    return c.json(config ?? DEFAULT_PREORDER_CONFIG);
  });

  return app;
}
