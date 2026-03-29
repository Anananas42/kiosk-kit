import type { AppUpdateStatus, ReleaseInfo } from "@kioskkit/shared";
import { AppUpdateStep, ReleaseType } from "@kioskkit/shared";
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
  | { source: "device"; result: { data: AppUpdateStatus } }
  | { source: "server"; operation: ServerOperation }
  | { source: "server"; status: "none" };

export async function fetchLatestAppRelease(): Promise<ReleaseInfo | null> {
  return trpc["releases.latest"].query({ type: ReleaseType.App });
}

export async function fetchAppUpdateStatus(deviceId: string): Promise<AppUpdateStatus | null> {
  const res = await fetch(`/api/devices/${deviceId}/app/status`);
  if (!res.ok) throw new Error("Failed to fetch app update status");
  const json = (await res.json()) as StatusResponse;
  return normalizeAppStatus(json);
}

function normalizeAppStatus(response: StatusResponse): AppUpdateStatus | null {
  if (response.source === "device") {
    return response.result.data;
  }

  if ("status" in response && response.status === "none") {
    return null;
  }

  const op = (response as { source: "server"; operation: ServerOperation }).operation;

  if (op.status === "in_progress") {
    if (op.type === "app_push") {
      return {
        status: AppUpdateStep.Uploading,
        currentVersion: null,
        upload: null,
        lastUpdate: null,
        lastResult: null,
        rollbackAvailable: false,
      };
    }
    if (op.type === "app_install") {
      return {
        status: AppUpdateStep.Installing,
        currentVersion: null,
        upload: null,
        lastUpdate: null,
        lastResult: null,
        rollbackAvailable: false,
      };
    }
  }

  // Completed or failed operations — return null to show idle state
  return null;
}

export async function triggerAppDownload(deviceId: string, version: string): Promise<void> {
  const res = await fetch(`/api/devices/${deviceId}/app/push`, {
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

export async function triggerAppInstall(deviceId: string): Promise<void> {
  const res = await fetch(`/api/devices/${deviceId}/app/install`, {
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

export async function triggerAppRollback(deviceId: string): Promise<void> {
  const res = await fetch(`/api/devices/${deviceId}/app/rollback`, {
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

export async function cancelAppDownload(deviceId: string): Promise<void> {
  const res = await fetch(`/api/devices/${deviceId}/app/cancel`, {
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
