import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import type { Db } from "../db/index.js";
import { pairingState } from "../db/schema.js";
import { env } from "../env.js";

function ensureRow(db: Db): void {
  const row = db.select().from(pairingState).where(eq(pairingState.id, 1)).get();
  if (!row) {
    db.insert(pairingState).values({ id: 1, consumed: false }).run();
  }
}

function isConsumed(db: Db): boolean {
  const row = db.select().from(pairingState).where(eq(pairingState.id, 1)).get();
  return row?.consumed ?? false;
}

export function pairingRoute(db: Db) {
  ensureRow(db);

  const app = new Hono();

  app.get(
    "/",
    describeRoute({
      tags: ["Pairing"],
      summary: "Get pairing code and status",
      description: "Returns the device pairing code and whether it has been consumed.",
      responses: {
        200: { description: "Pairing code and consumed status" },
      },
    }),
    (c) => c.json({ code: env.pairingCode, consumed: isConsumed(db) }),
  );

  app.post(
    "/consume",
    describeRoute({
      tags: ["Pairing"],
      summary: "Mark pairing code as consumed",
      description: "Sets the consumed flag to true.",
      responses: {
        200: { description: "Consumed flag set" },
      },
    }),
    (c) => {
      db.update(pairingState).set({ consumed: true }).where(eq(pairingState.id, 1)).run();
      return c.json({ ok: true });
    },
  );

  app.post(
    "/reset",
    describeRoute({
      tags: ["Pairing"],
      summary: "Reset pairing code consumed status",
      description: "Sets the consumed flag back to false for re-pairing.",
      responses: {
        200: { description: "Consumed flag reset" },
      },
    }),
    (c) => {
      db.update(pairingState).set({ consumed: false }).where(eq(pairingState.id, 1)).run();
      return c.json({ ok: true });
    },
  );

  return app;
}
