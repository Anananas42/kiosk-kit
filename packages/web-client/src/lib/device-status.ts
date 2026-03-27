export enum DeviceStatus {
  Online = "online",
  AppNotConnected = "app-not-connected",
  Offline = "offline",
}

export function deriveDeviceStatus(
  tailscaleOnline: boolean,
  appResponding: boolean | null | undefined,
): DeviceStatus | null {
  if (appResponding == null) return null;
  if (!tailscaleOnline) return DeviceStatus.Offline;
  if (!appResponding) return DeviceStatus.AppNotConnected;
  return DeviceStatus.Online;
}
