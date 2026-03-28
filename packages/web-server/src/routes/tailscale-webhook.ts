import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { DEVICE_TIMEOUT_MS } from "../config.js";
import type { Db } from "../db/index.js";
import { devices } from "../db/schema.js";
import { fetchDeviceProxy } from "../services/device-network.js";
import { getTailscaleClient } from "../services/tailscale.js";

interface WebhookEvent {
  timestamp: string;
  version: number;
  type: string;
  tailnet: string;
  message: string;
  data?: {
    nodeID: string;
    deviceName: string;
    managedBy: string;
    actor: string;
    url: string;
  };
}

function verifySignature(secret: string, header: string, body: string): boolean {
  const parts = header.split(",");
  const tPart = parts.find((p) => p.startsWith("t="));
  const vPart = parts.find((p) => p.startsWith("v1="));
  if (!tPart || !vPart) return false;

  const timestamp = tPart.slice(2);
  const signature = vPart.slice(3);

  const mac = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");

  try {
    return timingSafeEqual(Buffer.from(mac, "hex"), Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

async function fetchPairingCode(device: {
  id: string;
  tailscaleIp: string | null;
}): Promise<string | null> {
  if (!device.tailscaleIp) return null;
  try {
    const res = await fetchDeviceProxy(device, "/api/pairing", {
      signal: AbortSignal.timeout(DEVICE_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { code?: string };
    return body.code && /^\d{9}$/.test(body.code) ? body.code : null;
  } catch {
    return null;
  }
}

export function tailscaleWebhookRoute(db: Db) {
  const app = new Hono();

  app.post("/", async (c) => {
    const secret = process.env.TAILSCALE_WEBHOOK_SECRET;
    if (!secret) {
      console.error("[tailscale-webhook] TAILSCALE_WEBHOOK_SECRET not set");
      return c.json({ error: "Webhook not configured" }, 500);
    }

    const signature = c.req.header("Tailscale-Webhook-Signature");
    if (!signature) {
      return c.json({ error: "Missing signature" }, 401);
    }

    const rawBody = await c.req.text();

    if (!verifySignature(secret, signature, rawBody)) {
      return c.json({ error: "Invalid signature" }, 401);
    }

    const events: WebhookEvent[] = JSON.parse(rawBody);

    for (const event of events) {
      if (event.type === "nodeCreated" && event.data) {
        await handleNodeCreated(db, event.data.nodeID);
      }
    }

    return c.json({ ok: true });
  });

  return app;
}

async function handleNodeCreated(db: Db, nodeId: string): Promise<void> {
  // Check if we already have this device
  const [existing] = await db
    .select({ id: devices.id })
    .from(devices)
    .where(eq(devices.tailscaleNodeId, nodeId));

  if (existing) return;

  // Fetch device details from Tailscale API
  const ts = getTailscaleClient();
  const td = await ts.getDevice(nodeId);

  // Only process kioskkit-tagged devices
  if (!td.tags?.includes("tag:kioskkit") || td.tags?.includes("tag:server")) {
    return;
  }

  const ip = td.addresses.find((a) => a.startsWith("100.")) ?? null;

  const [inserted] = await db
    .insert(devices)
    .values({
      tailscaleNodeId: nodeId,
      tailscaleIp: ip,
      name: td.hostname,
    })
    .returning();

  console.log(`[tailscale-webhook] Device registered: ${td.hostname} (${nodeId})`);

  // Try to fetch pairing code from the device
  const code = await fetchPairingCode({ id: inserted.id, tailscaleIp: ip });
  if (code) {
    await db.update(devices).set({ pairingCode: code }).where(eq(devices.id, inserted.id));
    console.log(`[tailscale-webhook] Pairing code set for ${td.hostname}`);
  }
}
