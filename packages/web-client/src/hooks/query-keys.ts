export const queryKeys = {
  me: ["me"] as const,
  devices: ["devices"] as const,
  device: (id: string) => ["device", id] as const,
  deviceStatus: (id: string) => ["deviceStatus", id] as const,
  backups: (deviceId: string) => ["backups", deviceId] as const,
  updateInfo: (deviceId: string) => ["updateInfo", deviceId] as const,
  deviceUpdateStatus: (deviceId: string) => ["deviceUpdateStatus", deviceId] as const,
  serverUpdateStatus: (deviceId: string) => ["serverUpdateStatus", deviceId] as const,
};
