import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Store } from "../db/store.js";

const CatalogItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  quantity: z.string(),
  price: z.string(),
  dphRate: z.string(),
});

const CatalogCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  preorder: z.boolean(),
  items: z.array(CatalogItemSchema),
});

export function catalogRoute(store: Store) {
  const app = new Hono();

  app.get(
    "/",
    describeRoute({
      tags: ["Touchscreen"],
      summary: "Get catalog",
      description: "Returns the full catalog of categories and items.",
      responses: {
        200: {
          description: "Catalog categories with items",
          content: {
            "application/json": {
              schema: resolver(z.array(CatalogCategorySchema)),
            },
          },
        },
      },
    }),
    (c) => {
      const catalog = store.getCatalog();
      return c.json(catalog);
    },
  );

  return app;
}
