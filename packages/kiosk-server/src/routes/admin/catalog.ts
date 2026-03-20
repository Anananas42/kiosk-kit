import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Store } from "../../db/store.js";

const OkResponse = resolver(z.object({ ok: z.boolean() }));
const OkWithIdResponse = resolver(z.object({ ok: z.boolean(), id: z.number().int() }));
const ErrorResponse = resolver(z.object({ error: z.string() }));

export function adminCatalogRoute(store: Store) {
  const app = new Hono();

  // -- Categories --

  app.post(
    "/categories",
    describeRoute({
      tags: ["Admin"],
      summary: "Create category",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object" as const,
              required: ["name"],
              properties: {
                name: { type: "string" as const, minLength: 1 },
                preorder: { type: "boolean" as const },
                sortOrder: { type: "integer" as const },
              },
            },
          },
        },
      },
      responses: {
        201: {
          description: "Category created",
          content: { "application/json": { schema: OkWithIdResponse } },
        },
        400: {
          description: "Validation error",
          content: { "application/json": { schema: ErrorResponse } },
        },
      },
    }),
    async (c) => {
      const { name, preorder, sortOrder } = await c.req.json();
      if (typeof name !== "string" || !name.trim()) {
        return c.json({ error: "Invalid name" }, 400);
      }
      const id = store.createCategory(name.trim(), !!preorder, Number(sortOrder) || 0);
      return c.json({ ok: true, id }, 201);
    },
  );

  app.put(
    "/categories",
    describeRoute({
      tags: ["Admin"],
      summary: "Update category",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object" as const,
              required: ["id", "name"],
              properties: {
                id: { type: "integer" as const },
                name: { type: "string" as const, minLength: 1 },
                preorder: { type: "boolean" as const },
                sortOrder: { type: "integer" as const },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: "Category updated",
          content: { "application/json": { schema: OkResponse } },
        },
        400: {
          description: "Validation error",
          content: { "application/json": { schema: ErrorResponse } },
        },
      },
    }),
    async (c) => {
      const { id, name, preorder, sortOrder } = await c.req.json();
      if (typeof id !== "number") return c.json({ error: "Invalid id" }, 400);
      if (typeof name !== "string" || !name.trim()) {
        return c.json({ error: "Invalid name" }, 400);
      }
      store.updateCategory(id, name.trim(), !!preorder, Number(sortOrder) || 0);
      return c.json({ ok: true });
    },
  );

  app.delete(
    "/categories",
    describeRoute({
      tags: ["Admin"],
      summary: "Delete category",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object" as const,
              required: ["id"],
              properties: { id: { type: "integer" as const } },
            },
          },
        },
      },
      responses: {
        200: {
          description: "Category deleted",
          content: { "application/json": { schema: OkResponse } },
        },
        400: {
          description: "Validation error",
          content: { "application/json": { schema: ErrorResponse } },
        },
      },
    }),
    async (c) => {
      const { id } = await c.req.json();
      if (typeof id !== "number") return c.json({ error: "Invalid id" }, 400);
      store.deleteCategory(id);
      return c.json({ ok: true });
    },
  );

  // -- Items --

  app.post(
    "/items",
    describeRoute({
      tags: ["Admin"],
      summary: "Create item",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object" as const,
              required: ["categoryId", "name"],
              properties: {
                categoryId: { type: "integer" as const },
                name: { type: "string" as const, minLength: 1 },
                quantity: { type: "string" as const },
                price: { type: "string" as const },
                dphRate: { type: "string" as const },
                sortOrder: { type: "integer" as const },
              },
            },
          },
        },
      },
      responses: {
        201: {
          description: "Item created",
          content: { "application/json": { schema: OkWithIdResponse } },
        },
        400: {
          description: "Validation error",
          content: { "application/json": { schema: ErrorResponse } },
        },
      },
    }),
    async (c) => {
      const { categoryId, name, quantity, price, dphRate, sortOrder } = await c.req.json();
      if (typeof categoryId !== "number") return c.json({ error: "Invalid categoryId" }, 400);
      if (typeof name !== "string" || !name.trim()) {
        return c.json({ error: "Invalid name" }, 400);
      }
      const id = store.createItem(
        categoryId,
        name.trim(),
        String(quantity ?? ""),
        String(price ?? ""),
        String(dphRate ?? ""),
        Number(sortOrder) || 0,
      );
      return c.json({ ok: true, id }, 201);
    },
  );

  app.put(
    "/items",
    describeRoute({
      tags: ["Admin"],
      summary: "Update item",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object" as const,
              required: ["id", "name"],
              properties: {
                id: { type: "integer" as const },
                name: { type: "string" as const, minLength: 1 },
                quantity: { type: "string" as const },
                price: { type: "string" as const },
                dphRate: { type: "string" as const },
                sortOrder: { type: "integer" as const },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: "Item updated",
          content: { "application/json": { schema: OkResponse } },
        },
        400: {
          description: "Validation error",
          content: { "application/json": { schema: ErrorResponse } },
        },
      },
    }),
    async (c) => {
      const { id, name, quantity, price, dphRate, sortOrder } = await c.req.json();
      if (typeof id !== "number") return c.json({ error: "Invalid id" }, 400);
      if (typeof name !== "string" || !name.trim()) {
        return c.json({ error: "Invalid name" }, 400);
      }
      store.updateItem(
        id,
        name.trim(),
        String(quantity ?? ""),
        String(price ?? ""),
        String(dphRate ?? ""),
        Number(sortOrder) || 0,
      );
      return c.json({ ok: true });
    },
  );

  app.delete(
    "/items",
    describeRoute({
      tags: ["Admin"],
      summary: "Delete item",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object" as const,
              required: ["id"],
              properties: { id: { type: "integer" as const } },
            },
          },
        },
      },
      responses: {
        200: {
          description: "Item deleted",
          content: { "application/json": { schema: OkResponse } },
        },
        400: {
          description: "Validation error",
          content: { "application/json": { schema: ErrorResponse } },
        },
      },
    }),
    async (c) => {
      const { id } = await c.req.json();
      if (typeof id !== "number") return c.json({ error: "Invalid id" }, 400);
      store.deleteItem(id);
      return c.json({ ok: true });
    },
  );

  return app;
}
