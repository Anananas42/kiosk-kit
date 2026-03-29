import type { OtaStatus, ReleaseInfo } from "@kioskkit/shared";
import { OtaStep, ReleaseType } from "@kioskkit/shared";
import { trpc } from "../trpc.js";

interface ServerOperation {
  id: string;
  deviceId: string;
  type: string;
  status: string;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
  metadata: Record<string, unknown> | null;
}

type StatusResponse =
  | { source: "device"; result: { data: OtaStatus } }
  | { source: "server"; operation: ServerOperation }
  | { source: "server"; status: "none" };

export async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  return trpc["releases.latest"].query();
}

export async function fetchLatestOtaRelease(): Promise<ReleaseInfo | null> {
  return trpc["releases.latest"].query({ type: ReleaseType.Ota });
}

export async function fetchOtaStatus(deviceId: string): Promise<OtaStatus | null> {
  const res = await fetch(`/api/devices/${deviceId}/ota/status`);
  if (!res.ok) throw new Error("Failed to fetch OTA status");
  const json = (await res.json()) as StatusResponse;
  return normalizeOtaStatus(json);
}

function normalizeOtaStatus(response: StatusResponse): OtaStatus | null {
  if (response.source === "device") {
    return response.result.data;
  }

  if ("status" in response && response.status === "none") {
    return {
      status: OtaStep.Idle,
      activeSlot: "A",
      committedSlot: "A",
      currentVersion: null,
      upload: null,
      lastUpdate: null,
      lastResult: null,
    };
  }

  const op = (response as { source: "server"; operation: ServerOperation }).operation;

  if (op.status === "in_progress") {
    if (op.type === "ota_push") {
      return {
        status: OtaStep.Uploading,
        activeSlot: "A",
        committedSlot: "A",
        currentVersion: null,
        upload: null,
        lastUpdate: null,
        lastResult: null,
      };
    }
    if (op.type === "ota_install") {
      return {
        status: OtaStep.Installing,
        activeSlot: "A",
        committedSlot: "A",
        currentVersion: null,
        upload: null,
        lastUpdate: null,
        lastResult: null,
      };
    }
  }

  return null;
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
  const res = await fetch(`/api/devices/${deviceId}/ota/install`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: "Install failed" }))) as {
      error?: string;
    };
    throw new Error(err.error ?? "Install failed");
  }
}

export async function triggerOtaRollback(deviceId: string): Promise<void> {
  const res = await fetch(`/api/devices/${deviceId}/ota/rollback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: "Rollback failed" }))) as {
      error?: string;
    };
    throw new Error(err.error ?? "Rollback failed");
  }
}

export async function cancelOtaDownload(deviceId: string): Promise<void> {
  const res = await fetch(`/api/devices/${deviceId}/ota/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: "Cancel failed" }))) as {
      error?: string;
    };
    throw new Error(err.error ?? "Cancel failed");
  }
}
