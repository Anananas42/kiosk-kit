import type { User } from "@kioskkit/shared";
import { trpc } from "./trpc.js";

export type { User };

export type Device = {
  id: string;
  userId: string;
  name: string;
  tailscaleIp?: string;
  createdAt: string;
};

export async function fetchMe(): Promise<User | null> {
  const result = await trpc.me.query();
  return result.user;
}

export async function fetchDevices(): Promise<Device[]> {
  const res = await fetch("/api/devices");
  if (!res.ok) throw new Error("Failed to fetch devices");
  return res.json();
}

export async function createDevice(
  name: string,
  tailscaleIp: string,
  userId: string,
): Promise<Device> {
  const res = await fetch("/api/devices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, tailscale_ip: tailscaleIp, user_id: userId }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error ?? "Failed to create device");
  }
  return res.json();
}

export async function fetchDevice(id: string): Promise<Device> {
  const res = await fetch(`/api/devices/${id}`);
  if (!res.ok) throw new Error("Failed to fetch device");
  return res.json();
}

export async function deleteDevice(id: string): Promise<void> {
  const res = await fetch(`/api/devices/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete device");
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
