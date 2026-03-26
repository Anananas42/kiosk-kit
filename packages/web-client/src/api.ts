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

// ── OTA helpers ────────────────────────────────────────────────────

export interface ReleaseInfo {
  version: string;
  sha256: string;
  releaseNotes: string | null;
  publishedAt: string;
}

export interface OtaStatus {
  status: "idle" | "uploading" | "downloaded" | "installing" | "confirming" | "rollback";
  activeSlot: "A" | "B";
  committedSlot: "A" | "B";
  currentVersion: string | null;
  upload: {
    version: string;
    progress: number;
    bytesReceived: number;
    bytesTotal: number;
  } | null;
  lastUpdate: string | null;
  lastResult: "success" | "failed_health_check" | "failed_upload" | "failed_install" | null;
}

export async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  return trpc["releases.latest"].query();
}

export async function fetchOtaStatus(deviceId: string): Promise<OtaStatus> {
  const res = await fetch(`/api/devices/${deviceId}/kiosk/trpc/admin.ota.status`);
  if (!res.ok) throw new Error("Failed to fetch OTA status");
  const json = (await res.json()) as { result: { data: OtaStatus } };
  return json.result.data;
}

export async function triggerOtaDownload(deviceId: string, version: string): Promise<void> {
  const res = await fetch(`/api/devices/${deviceId}/ota/push`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: "Download failed" }))) as {
      error?: string;
    };
    throw new Error(err.error ?? "Download failed");
  }
}

export async function triggerOtaInstall(deviceId: string): Promise<void> {
  const res = await fetch(`/api/devices/${deviceId}/kiosk/trpc/admin.ota.install`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error("Install failed");
}

export async function triggerOtaRollback(deviceId: string): Promise<void> {
  const res = await fetch(`/api/devices/${deviceId}/kiosk/trpc/admin.ota.rollback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error("Rollback failed");
}

export async function cancelOtaDownload(deviceId: string): Promise<void> {
  const res = await fetch(`/api/devices/${deviceId}/kiosk/trpc/admin.ota.cancelUpload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error("Cancel failed");
}
