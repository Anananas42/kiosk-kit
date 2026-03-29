import type { DeviceUpdateInfo, UpdateOp, UpdateStatus } from "@kioskkit/shared";

/**
 * Calls tRPC procedures on the admin router (/api/admin/trpc/).
 *
 * The web-client's tRPC client is typed against AppRouter (/api/trpc/),
 * which intentionally does not include admin-only procedures like device
 * updates. Rather than widening AppRouter or creating a second typed client,
 * we call the admin endpoints via fetch — the same pattern the old OTA API
 * layer used for device-proxy and admin calls.
 */

async function adminQuery<T>(procedure: string, input: Record<string, unknown>): Promise<T> {
  const encoded = encodeURIComponent(JSON.stringify(input));
  const res = await fetch(`/api/admin/trpc/${procedure}?input=${encoded}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = (body as { error?: { message?: string } }).error?.message;
    throw new Error(msg ?? `${procedure} failed`);
  }
  const json = (await res.json()) as { result: { data: T } };
  return json.result.data;
}

async function adminMutate<T>(procedure: string, input: Record<string, unknown>): Promise<T> {
  const res = await fetch(`/api/admin/trpc/${procedure}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = (body as { error?: { message?: string } }).error?.message;
    throw new Error(msg ?? `${procedure} failed`);
  }
  const json = (await res.json()) as { result: { data: T } };
  return json.result.data;
}

export async function fetchUpdateInfo(deviceId: string): Promise<DeviceUpdateInfo> {
  return adminQuery<DeviceUpdateInfo>("devices.updateInfo", { id: deviceId });
}

export async function triggerUpdateInstall(deviceId: string) {
  return adminMutate<{ ok: boolean }>("devices.updateInstall", { id: deviceId });
}

export async function triggerUpdateCancel(deviceId: string) {
  return adminMutate<{ ok: boolean }>("devices.updateCancel", { id: deviceId });
}

export async function fetchServerUpdateStatus(deviceId: string) {
  return adminQuery<{ operation: UpdateOp | null }>("devices.updateStatus", { id: deviceId });
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
