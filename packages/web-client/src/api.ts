import type { Device, User } from "@kioskkit/shared";
import { trpc } from "./trpc.js";

export type { Device, User };

export async function fetchMe(): Promise<User | null> {
  const result = await trpc.me.query();
  return result.user;
}

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

export async function fetchBackups(
  deviceId: string,
): Promise<{ id: string; sizeBytes: number; createdAt: string }[]> {
  return trpc["backups.list"].query({ deviceId });
}

export async function fetchBackupDownloadUrl(backupId: string): Promise<string> {
  const { url } = await trpc["backups.getDownloadUrl"].query({ backupId });
  return url;
}

export function logout(): Promise<Response> {
  return fetch("/api/auth/logout", { method: "POST" });
}
