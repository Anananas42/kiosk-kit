import { OtaResult, type OtaStatus, OtaStep, ReleaseType } from "@kioskkit/shared";
import { trpc } from "../trpc.js";

export async function fetchLatestRelease() {
  return trpc["releases.latest"].query({ type: ReleaseType.Ota });
}

interface ServerOperation {
  id: string;
  deviceId: string;
  type: string;
  status: string;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
  metadata: unknown;
}

type StatusResponse =
  | ({ source: "device" } & { result: { data: OtaStatus } })
  | { source: "server"; operation: ServerOperation }
  | { source: "server"; status: "none" };

function normalizeServerOperation(op: ServerOperation): OtaStatus {
  const version =
    op.metadata && typeof op.metadata === "object" && "version" in op.metadata
      ? String((op.metadata as { version: string }).version)
      : null;

  const base: OtaStatus = {
    status: OtaStep.Idle,
    activeSlot: "A",
    committedSlot: "A",
    currentVersion: version,
    upload: null,
    lastUpdate: op.completedAt ?? op.startedAt,
    lastResult: null,
  };

  if (op.status === "in_progress") {
    if (op.type === "ota_push") {
      base.status = OtaStep.Uploading;
      base.upload = { version: version ?? "", progress: 0, bytesReceived: 0, bytesTotal: 0 };
    } else if (op.type === "ota_install") {
      base.status = OtaStep.Installing;
    } else if (op.type === "ota_rollback") {
      base.status = OtaStep.Rollback;
    }
  } else if (op.status === "completed") {
    base.lastResult = OtaResult.Success;
  } else if (op.status === "failed") {
    if (op.type === "ota_push") {
      base.lastResult = OtaResult.FailedUpload;
    } else if (op.type === "ota_install") {
      base.lastResult = OtaResult.FailedInstall;
    } else {
      base.lastResult = OtaResult.FailedInstall;
    }
  }

  return base;
}

export async function fetchOtaStatus(deviceId: string): Promise<OtaStatus> {
  const res = await fetch(`/api/devices/${deviceId}/ota/status`);
  if (!res.ok) throw new Error("Failed to fetch OTA status");
  const json = (await res.json()) as StatusResponse;

  if (json.source === "device") {
    return json.result.data;
  }

  if ("operation" in json) {
    return normalizeServerOperation(json.operation);
  }

  // source: "server", status: "none" — no operations recorded
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
  if (!res.ok) throw new Error("Install failed");
}

export async function triggerOtaRollback(deviceId: string): Promise<void> {
  const res = await fetch(`/api/devices/${deviceId}/ota/rollback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error("Rollback failed");
}

export async function cancelOtaDownload(deviceId: string): Promise<void> {
  const res = await fetch(`/api/devices/${deviceId}/ota/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error("Cancel failed");
}
