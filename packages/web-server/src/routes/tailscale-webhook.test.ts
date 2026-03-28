import { createHmac } from "node:crypto";
import { derivePairingCode } from "@kioskkit/shared";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { Db } from "../db/index.js";
import { tailscaleWebhookRoute } from "./tailscale-webhook.js";

const SECRET = "test-webhook-secret";

vi.mock("../services/tailscale.js", () => ({
  getTailscaleClient: vi.fn().mockReturnValue({
    getDevice: vi.fn().mockResolvedValue({
      nodeId: "n-1",
      name: "kiosk-1",
      hostname: "kiosk-1",
      addresses: ["100.64.1.5"],
      tags: ["tag:kioskkit"],
      online: true,
      lastSeen: new Date().toISOString(),
    }),
  }),
}));

function createMockDb(existingDevices: unknown[] = []) {
  const inserted = {
    id: "d-1",
    tailscaleNodeId: "n-1",
    tailscaleIp: "100.64.1.5",
    name: "kiosk-1",
    pairingCode: derivePairingCode("n-1"),
  };
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(existingDevices),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([inserted]),
  } as unknown as Db;
}

function sign(body: string): string {
  const t = Math.floor(Date.now() / 1000).toString();
  const mac = createHmac("sha256", SECRET).update(`${t}.${body}`).digest("hex");
  return `t=${t},v1=${mac}`;
}

function makeApp(db: Db) {
  const app = new Hono();
  app.route("/webhooks/tailscale", tailscaleWebhookRoute(db));
  return app;
}

describe("tailscale webhook", () => {
  it("rejects requests without signature", async () => {
    vi.stubEnv("TAILSCALE_WEBHOOK_SECRET", SECRET);
    const app = makeApp(createMockDb());

    const res = await app.request("/webhooks/tailscale", { method: "POST", body: "[]" });
    expect(res.status).toBe(401);

    vi.unstubAllEnvs();
  });

  it("rejects requests with invalid signature", async () => {
    vi.stubEnv("TAILSCALE_WEBHOOK_SECRET", SECRET);
    const app = makeApp(createMockDb());

    const res = await app.request("/webhooks/tailscale", {
      method: "POST",
      body: "[]",
      headers: { "Tailscale-Webhook-Signature": "t=123,v1=bad" },
    });
    expect(res.status).toBe(401);

    vi.unstubAllEnvs();
  });

  it("registers a new device with derived pairing code on nodeCreated", async () => {
    vi.stubEnv("TAILSCALE_WEBHOOK_SECRET", SECRET);

    const db = createMockDb([]);
    const app = makeApp(db);

    const body = JSON.stringify([
      {
        timestamp: new Date().toISOString(),
        version: 1,
        type: "nodeCreated",
        tailnet: "test.com",
        message: "Node kiosk-1 created",
        data: {
          nodeID: "n-1",
          deviceName: "kiosk-1.test.com",
          managedBy: "admin@test.com",
          actor: "admin@test.com",
          url: "https://login.tailscale.com/admin/machines/100.64.1.5",
        },
      },
    ]);

    const res = await app.request("/webhooks/tailscale", {
      method: "POST",
      body,
      headers: { "Tailscale-Webhook-Signature": sign(body) },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(db.insert).toHaveBeenCalled();
    // Verify pairing code was passed to the insert
    const mockValues = (db as unknown as { values: ReturnType<typeof vi.fn> }).values;
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ pairingCode: derivePairingCode("n-1") }),
    );

    vi.unstubAllEnvs();
  });

  it("skips already-known devices", async () => {
    vi.stubEnv("TAILSCALE_WEBHOOK_SECRET", SECRET);

    const db = createMockDb([{ id: "existing" }]);
    const app = makeApp(db);

    const body = JSON.stringify([
      {
        timestamp: new Date().toISOString(),
        version: 1,
        type: "nodeCreated",
        tailnet: "test.com",
        message: "Node kiosk-1 created",
        data: { nodeID: "n-1", deviceName: "kiosk-1", managedBy: "", actor: "", url: "" },
      },
    ]);

    const res = await app.request("/webhooks/tailscale", {
      method: "POST",
      body,
      headers: { "Tailscale-Webhook-Signature": sign(body) },
    });

    expect(res.status).toBe(200);
    expect(db.insert).not.toHaveBeenCalled();

    vi.unstubAllEnvs();
  });
});
