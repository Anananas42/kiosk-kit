import type { Device } from "@kioskkit/shared";

export const LOCAL_DEVICE_ID = "00000000-0000-0000-0000-000000000000";
export const LOCAL_DEVICE_HOST = "localhost:3001";
export const LOCAL_KIOSK_ADMIN_HOST = "localhost:5176";

export function makeLocalDevice(userId: string | null): Device {
  return {
    id: LOCAL_DEVICE_ID,
    tailscaleNodeId: "local-dev",
    userId,
    name: "Local Kiosk",
    online: true,
    lastSeen: null,
    hostname: "local-kiosk",
    createdAt: new Date(0).toISOString(),
  };
}
