import type { OtaStatus, ReleaseInfo } from "@kioskkit/shared";
import { trpc } from "../trpc.js";

export async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  return trpc["releases.latest"].query();
}

export async function fetchOtaStatus(deviceId: string): Promise<OtaStatus> {
  const res = await fetch(`/api/devices/${deviceId}/kiosk/api/trpc/admin.ota.status`);
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
  const res = await fetch(`/api/devices/${deviceId}/kiosk/api/trpc/admin.ota.install`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error("Install failed");
}

export async function triggerOtaRollback(deviceId: string): Promise<void> {
  const res = await fetch(`/api/devices/${deviceId}/kiosk/api/trpc/admin.ota.rollback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error("Rollback failed");
}

export async function cancelOtaDownload(deviceId: string): Promise<void> {
  const res = await fetch(`/api/devices/${deviceId}/kiosk/api/trpc/admin.ota.cancelUpload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error("Cancel failed");
}
