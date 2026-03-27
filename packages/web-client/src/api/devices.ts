import type { Device } from "@kioskkit/shared";
import { trpc } from "../trpc.js";

export async function fetchDevices(): Promise<Device[]> {
  return trpc["devices.list"].query();
}

export async function fetchDevice(id: string): Promise<Device> {
  return trpc["devices.get"].query({ id });
}

export async function fetchDeviceStatus(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/devices/${id}/status`);
    if (!res.ok) return false;
    const data = await res.json();
    return data.online ?? false;
  } catch {
    return false;
  }
}
