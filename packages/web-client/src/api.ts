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

export async function createDevice(
  name: string,
  tailscaleIp: string,
  userId: string,
): Promise<Device> {
  return trpc["devices.create"].mutate({ name, tailscaleIp, userId });
}

export async function fetchDevice(id: string): Promise<Device> {
  return trpc["devices.get"].query({ id });
}

export async function deleteDevice(id: string): Promise<void> {
  await trpc["devices.delete"].mutate({ id });
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

// ── Device proxy API ────────────────────────────────────────────────

function kioskUrl(deviceId: string, path: string) {
  return `/api/devices/${deviceId}/kiosk/${path}`;
}

async function proxyGet<T>(deviceId: string, path: string): Promise<T> {
  const res = await fetch(kioskUrl(deviceId, path));
  if (res.status === 502) throw new Error("Device is offline");
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

async function proxyMutate(
  deviceId: string,
  path: string,
  method: string,
  body: unknown,
): Promise<void> {
  const res = await fetch(kioskUrl(deviceId, path), {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 502) throw new Error("Device is offline");
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }
}

// Read endpoints
export const fetchCatalog = (id: string) => proxyGet<CatalogCategory[]>(id, "catalog");

export const fetchBuyers = (id: string) =>
  proxyGet<{ buyers: Buyer[] }>(id, "buyers").then((d) => d.buyers);

export const fetchConsumption = (id: string) =>
  proxyGet<{ rows: ConsumptionRow[] }>(id, "reports/consumption").then((d) => d.rows);

export const fetchSettings = (id: string) => proxyGet<KioskSettings>(id, "settings");

// Admin endpoints
export const createBuyer = (id: string, buyerId: number, label: string) =>
  proxyMutate(id, "admin/buyers", "POST", { id: buyerId, label });

export const updateBuyer = (id: string, buyerId: number, label: string) =>
  proxyMutate(id, "admin/buyers", "PUT", { id: buyerId, label });

export const deleteBuyer = (id: string, buyerId: number) =>
  proxyMutate(id, "admin/buyers", "DELETE", { id: buyerId });

export const createCategory = (id: string, name: string, preorder: boolean, sortOrder: number) =>
  proxyMutate(id, "admin/catalog/categories", "POST", { name, preorder, sortOrder });

export const updateCategory = (
  id: string,
  catId: number,
  name: string,
  preorder: boolean,
  sortOrder: number,
) =>
  proxyMutate(id, "admin/catalog/categories", "PUT", {
    id: catId,
    name,
    preorder,
    sortOrder,
  });

export const deleteCategory = (id: string, catId: number) =>
  proxyMutate(id, "admin/catalog/categories", "DELETE", { id: catId });

export const createItem = (
  id: string,
  categoryId: number,
  data: { name: string; quantity: string; price: string; dphRate: string; sortOrder: number },
) => proxyMutate(id, "admin/catalog/items", "POST", { categoryId, ...data });

export const updateItem = (
  id: string,
  itemId: number,
  data: { name: string; quantity: string; price: string; dphRate: string; sortOrder: number },
) => proxyMutate(id, "admin/catalog/items", "PUT", { id: itemId, ...data });

export const deleteItem = (id: string, itemId: number) =>
  proxyMutate(id, "admin/catalog/items", "DELETE", { id: itemId });

export const updateSettings = (id: string, settings: Partial<KioskSettings>) =>
  proxyMutate(id, "admin/settings", "PUT", settings);

// Types used by proxy API
import type { Buyer, CatalogCategory, KioskSettings } from "@kioskkit/shared";

export type ConsumptionRow = {
  item: string;
  itemId: string;
  category: string;
  quantity: string;
  price: string;
  byBuyer: Record<string, number>;
};
