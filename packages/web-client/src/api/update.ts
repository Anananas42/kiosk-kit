import type { DeviceUpdateInfo, UpdateStatus } from "@kioskkit/shared";
import { adminTrpc } from "../trpc.js";

export async function fetchUpdateInfo(deviceId: string): Promise<DeviceUpdateInfo> {
  return adminTrpc["devices.updateInfo"].query({ id: deviceId });
}

export async function triggerUpdateInstall(deviceId: string) {
  return adminTrpc["devices.updateInstall"].mutate({ id: deviceId });
}

export async function triggerUpdateCancel(deviceId: string) {
  return adminTrpc["devices.updateCancel"].mutate({ id: deviceId });
}

export async function fetchServerUpdateStatus(deviceId: string) {
  return adminTrpc["devices.updateStatus"].query({ id: deviceId });
}

export async function triggerUpdatePush(deviceId: string): Promise<void> {
  const res = await fetch(`/api/devices/${deviceId}/update/push`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: "Push failed" }))) as {
      error?: string;
    };
    throw new Error(err.error ?? "Push failed");
  }
}

export async function fetchDeviceUpdateStatus(deviceId: string): Promise<UpdateStatus> {
  const res = await fetch(`/api/devices/${deviceId}/kiosk/api/trpc/admin.update.status`);
  if (!res.ok) throw new Error("Failed to fetch device update status");
  const json = (await res.json()) as { result: { data: UpdateStatus } };
  return json.result.data;
}
