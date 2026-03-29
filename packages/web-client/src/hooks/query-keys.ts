export const queryKeys = {
  me: ["me"] as const,
  devices: ["devices"] as const,
  device: (id: string) => ["device", id] as const,
  deviceStatus: (id: string) => ["deviceStatus", id] as const,
  backups: (deviceId: string) => ["backups", deviceId] as const,
  latestRelease: ["latestRelease"] as const,
  otaStatus: (deviceId: string) => ["otaStatus", deviceId] as const,
  latestAppRelease: ["latestAppRelease"] as const,
  appUpdateStatus: (deviceId: string) => ["appUpdateStatus", deviceId] as const,
};
