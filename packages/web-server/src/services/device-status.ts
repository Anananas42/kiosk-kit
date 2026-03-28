import { DeviceStatus } from "@kioskkit/shared";
import { DEVICE_TIMEOUT_MS } from "../config.js";
import { fetchDeviceProxy } from "./device-network.js";
import { getCachedDevice } from "./tailscale.js";

export async function getDeviceStatus(device: {
  id: string;
  tailscaleNodeId: string;
  tailscaleIp: string | null;
}): Promise<DeviceStatus> {
  let tailscaleOnline = false;
  try {
    const td = await getCachedDevice(device.tailscaleNodeId);
    tailscaleOnline = td.online;
  } catch {
    return DeviceStatus.Offline;
  }

  if (!tailscaleOnline) {
    return DeviceStatus.Offline;
  }

  try {
    const res = await fetchDeviceProxy(device, "/api/health", {
      signal: AbortSignal.timeout(DEVICE_TIMEOUT_MS),
    });
    return res.ok ? DeviceStatus.Online : DeviceStatus.AppNotConnected;
  } catch {
    return DeviceStatus.AppNotConnected;
  }
}
