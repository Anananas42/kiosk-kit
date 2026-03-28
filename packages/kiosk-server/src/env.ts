import { resolve } from "node:path";
import { config } from "dotenv";

const root = resolve(import.meta.dirname, "../../..");

config({ path: resolve(root, ".env") });
// Load device config written at image build time (PAIRING_CODE, DEVICE_ID, etc.)
config({ path: "/etc/kioskkit/device.conf", override: false });

export const env = {
  port: Number(process.env.PORT) || 3001,
  deviceId: process.env.DEVICE_ID || "",
  pairingCode: process.env.PAIRING_CODE || "",
};

/** Returns true when DEVICE_ID is configured (device is registered with cloud). */
export function isCloudConfigured(): boolean {
  return env.deviceId !== "";
}
