import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { derivePairingCode } from "@kioskkit/shared";
import { config } from "dotenv";

const root = resolve(import.meta.dirname, "../../..");

config({ path: resolve(root, ".env") });
// Load device config written at image build time (DEVICE_ID, etc.)
config({ path: "/etc/kioskkit/device.conf", override: false });

export const env = {
  port: Number(process.env.PORT) || 3001,
  deviceId: process.env.DEVICE_ID || "",
  pairingCode: "",
};

/** Returns true when DEVICE_ID is configured (device is registered with cloud). */
export function isCloudConfigured(): boolean {
  return env.deviceId !== "";
}

/**
 * Fetch the Tailscale node ID and derive the pairing code.
 * Call once at startup after Tailscale is connected.
 */
export async function initPairingCode(): Promise<void> {
  const nodeId = await getTailscaleNodeId();
  if (nodeId) {
    env.pairingCode = derivePairingCode(nodeId);
  }
}

function getTailscaleNodeId(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile("tailscale", ["status", "--json"], { timeout: 5000 }, (err, stdout) => {
      if (err) {
        resolve(null);
        return;
      }
      try {
        const status = JSON.parse(stdout);
        resolve(status.Self?.ID ?? null);
      } catch {
        resolve(null);
      }
    });
  });
}
