import type { Device, OtaStatus, ReleaseInfo, User } from "@kioskkit/shared";
import { trpc } from "./trpc.js";

export type { Device, OtaStatus, ReleaseInfo, User };

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

export function logout(): Promise<Response> {
  return fetch("/api/auth/logout", { method: "POST" });
}

// ── OTA helpers ────────────────────────────────────────────────────

/** Fetch the latest published release from the web-server. */
export async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  return trpc["releases.latest"].query();
}

/** Proxied tRPC query → kiosk-server admin.ota.status */
export async function fetchOtaStatus(deviceId: string): Promise<OtaStatus> {
  const res = await fetch(`/api/devices/${deviceId}/kiosk/api/trpc/admin.ota.status`);
  if (!res.ok) throw new Error("Failed to fetch OTA status");
  const json = await res.json();
  return json.result.data;
}

/** Proxied tRPC mutation → kiosk-server admin.ota.download */
export async function triggerOtaDownload(
  deviceId: string,
  url: string,
  version: string,
  sha256: string,
): Promise<void> {
  const res = await fetch(`/api/devices/${deviceId}/kiosk/api/trpc/admin.ota.download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, version, sha256 }),
  });
  if (!res.ok) throw new Error("Failed to trigger OTA download");
}

/** Proxied tRPC mutation → kiosk-server admin.ota.install */
export async function triggerOtaInstall(deviceId: string): Promise<void> {
  const res = await fetch(`/api/devices/${deviceId}/kiosk/api/trpc/admin.ota.install`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error("Failed to trigger OTA install");
}

/** Proxied tRPC mutation → kiosk-server admin.ota.rollback */
export async function triggerOtaRollback(deviceId: string): Promise<void> {
  const res = await fetch(`/api/devices/${deviceId}/kiosk/api/trpc/admin.ota.rollback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error("Failed to trigger OTA rollback");
}

/** Proxied tRPC mutation → kiosk-server admin.ota.cancelUpload */
export async function cancelOtaDownload(deviceId: string): Promise<void> {
  const res = await fetch(`/api/devices/${deviceId}/kiosk/api/trpc/admin.ota.cancelUpload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error("Failed to cancel OTA download");
}

// ── Release management (admin) ─────────────────────────────────────

export async function publishRelease(input: {
  version: string;
  githubAssetUrl: string;
  sha256: string;
  releaseNotes?: string;
}): Promise<{ id: string; version: string }> {
  return trpc["releases.publish"].mutate(input);
}
