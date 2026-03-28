import type { Device, DeviceStatus } from "@kioskkit/shared";
import { trpc } from "../trpc.js";

export async function fetchDevices(): Promise<Device[]> {
  return trpc["devices.list"].query();
}

export async function fetchDevice(id: string): Promise<Device> {
  return trpc["devices.get"].query({ id });
}

export async function claimDevice(code: string): Promise<Device> {
  return trpc["devices.claim"].mutate({ code });
}

export async function renameDevice(id: string, name: string): Promise<Device> {
  return trpc["devices.rename"].mutate({ id, name });
}

export async function fetchDeviceStatus(id: string): Promise<DeviceStatus> {
  const data = await trpc["devices.status"].query({ id });
  return data.status;
}
