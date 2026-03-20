import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Store } from "../../db/store.js";

const OkResponse = resolver(z.object({ ok: z.boolean() }));
const ErrorResponse = resolver(z.object({ error: z.string() }));

const buyerBodySchema = {
  type: "object" as const,
  required: ["id", "label"],
  properties: {
    id: { type: "integer" as const, minimum: 1 },
    label: { type: "string" as const, minLength: 1 },
  },
};

export function adminBuyersRoute(store: Store) {
  const app = new Hono();

  app.post(
    "/",
    describeRoute({
      tags: ["Admin"],
      summary: "Create buyer",
      requestBody: {
        required: true,
        content: { "application/json": { schema: buyerBodySchema } },
      },
      responses: {
        201: {
          description: "Buyer created",
          content: { "application/json": { schema: OkResponse } },
        },
        400: {
          description: "Validation error",
          content: { "application/json": { schema: ErrorResponse } },
        },
        409: {
          description: "Buyer already exists",
          content: { "application/json": { schema: ErrorResponse } },
        },
      },
    }),
    async (c) => {
      const { id, label } = await c.req.json();
      if (typeof id !== "number" || !Number.isInteger(id) || id < 1) {
        return c.json({ error: "Invalid id" }, 400);
      }
      if (typeof label !== "string" || !label.trim()) {
        return c.json({ error: "Invalid label" }, 400);
      }
      try {
        store.createBuyer(id, label.trim());
      } catch (err) {
        if (err instanceof Error && /UNIQUE constraint/i.test(err.message)) {
          return c.json({ error: "Buyer already exists" }, 409);
        }
        throw err;
      }
      return c.json({ ok: true }, 201);
    },
  );

  app.put(
    "/",
    describeRoute({
      tags: ["Admin"],
      summary: "Update buyer",
      requestBody: {
        required: true,
        content: { "application/json": { schema: buyerBodySchema } },
      },
      responses: {
        200: {
          description: "Buyer updated",
          content: { "application/json": { schema: OkResponse } },
        },
        400: {
          description: "Validation error",
          content: { "application/json": { schema: ErrorResponse } },
        },
      },
    }),
    async (c) => {
      const { id, label } = await c.req.json();
      if (typeof id !== "number" || !Number.isInteger(id) || id < 1) {
        return c.json({ error: "Invalid id" }, 400);
      }
      if (typeof label !== "string" || !label.trim()) {
        return c.json({ error: "Invalid label" }, 400);
      }
      store.updateBuyer(id, label.trim());
      return c.json({ ok: true });
    },
  );

  app.delete(
    "/",
    describeRoute({
      tags: ["Admin"],
      summary: "Delete buyer",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object" as const,
              required: ["id"],
              properties: { id: { type: "integer" as const, minimum: 1 } },
            },
          },
        },
      },
      responses: {
        200: {
          description: "Buyer deleted",
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
      if (typeof id !== "number" || !Number.isInteger(id) || id < 1) {
        return c.json({ error: "Invalid id" }, 400);
      }
      store.deleteBuyer(id);
      return c.json({ ok: true });
    },
  );

  return app;
}
