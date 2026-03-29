import {
  AppUpdateResult,
  type AppUpdateStatus,
  AppUpdateStep,
  ReleaseType,
} from "@kioskkit/shared";
import { trpc } from "../trpc.js";

export async function fetchLatestAppRelease() {
  return trpc["releases.latest"].query({ type: ReleaseType.App });
}

interface DeviceStatusResponse {
  source: "device";
  result: { data: AppUpdateStatus };
}

interface ServerStatusResponse {
  source: "server";
  status?: string;
  operation?: {
    id: string;
    type: string;
    status: string;
    error: string | null;
    startedAt: string;
    completedAt: string | null;
    metadata: Record<string, unknown> | null;
  };
}

type StatusResponse = DeviceStatusResponse | ServerStatusResponse;

function normalizeServerOperation(
  op: NonNullable<ServerStatusResponse["operation"]>,
): AppUpdateStatus {
  const base: AppUpdateStatus = {
    status: AppUpdateStep.Idle,
    currentVersion: null,
    upload: null,
    lastUpdate: op.completedAt ?? op.startedAt,
    lastResult: null,
    rollbackAvailable: false,
  };

  if (op.status === "in_progress") {
    if (op.type === "app_push") {
      return { ...base, status: AppUpdateStep.Uploading };
    }
    if (op.type === "app_install") {
      return { ...base, status: AppUpdateStep.Installing };
    }
  }

  if (op.status === "completed") {
    return { ...base, lastResult: AppUpdateResult.Success };
  }

  if (op.status === "failed") {
    const result =
      op.type === "app_push" ? AppUpdateResult.FailedUpload : AppUpdateResult.FailedInstall;
    return { ...base, lastResult: result };
  }

  return base;
}

export async function fetchAppUpdateStatus(deviceId: string): Promise<AppUpdateStatus> {
  const res = await fetch(`/api/devices/${deviceId}/app/status`);
  if (!res.ok) throw new Error("Failed to fetch app update status");
  const json = (await res.json()) as StatusResponse;

  if (json.source === "device") {
    return json.result.data;
  }

  // Server fallback
  if (json.operation) {
    return normalizeServerOperation(json.operation);
  }

  // No operations at all — idle state
  return {
    status: AppUpdateStep.Idle,
    currentVersion: null,
    upload: null,
    lastUpdate: null,
    lastResult: null,
    rollbackAvailable: false,
  };
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
  if (!res.ok) throw new Error("Install failed");
}

export async function triggerAppRollback(deviceId: string): Promise<void> {
  const res = await fetch(`/api/devices/${deviceId}/app/rollback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error("Rollback failed");
}

export async function cancelAppDownload(deviceId: string): Promise<void> {
  const res = await fetch(`/api/devices/${deviceId}/app/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error("Cancel failed");
}
