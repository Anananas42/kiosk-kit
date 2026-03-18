import type { BuyersResponse } from "@kioskkit/shared";
import { Hono } from "hono";
import type { Store } from "../db/store.js";

export function buyersRoute(store: Store) {
  const app = new Hono();

  app.get("/", (c) => {
    const buyers = store.getBuyers();
    const response: BuyersResponse = { buyers };
    return c.json(response);
  });

  return app;
}
