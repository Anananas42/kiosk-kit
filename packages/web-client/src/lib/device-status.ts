export type DeviceStatus = "online" | "app-not-connected" | "offline";

export function deriveDeviceStatus(
  tailscaleOnline: boolean,
  appResponding: boolean | null | undefined,
): DeviceStatus | null {
  if (appResponding == null) return null;
  if (!tailscaleOnline) return "offline";
  if (!appResponding) return "app-not-connected";
  return "online";
}
