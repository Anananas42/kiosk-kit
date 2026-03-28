export enum DeviceStatus {
  Online = "online",
  AppNotConnected = "app-not-connected",
  Offline = "offline",
}

export function deriveDeviceStatus(
  tailscaleOnline: boolean,
  appResponding: boolean | null | undefined,
): DeviceStatus {
  if (!tailscaleOnline) return DeviceStatus.Offline;
  if (appResponding) return DeviceStatus.Online;
  return DeviceStatus.AppNotConnected;
}
