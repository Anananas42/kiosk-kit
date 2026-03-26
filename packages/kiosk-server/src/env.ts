import { resolve } from "node:path";
import { config } from "dotenv";

const root = resolve(import.meta.dirname, "../../..");

config({ path: resolve(root, ".env") });

export const env = {
  port: Number(process.env.PORT) || 3001,
  deviceId: process.env.DEVICE_ID || "",
  webServerUrl: process.env.WEB_SERVER_URL || "",
};

/** Returns true when DEVICE_ID is configured (device is registered with cloud). */
export function isCloudConfigured(): boolean {
  return env.deviceId !== "";
}
