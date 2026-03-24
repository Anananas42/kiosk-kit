import type { Device, User } from "@kioskkit/shared";
import { trpc } from "./trpc.js";
import { createDeviceTrpcClient } from "./device-trpc.js";

export type { Device, User };

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

// ── Device proxy API (via tRPC) ─────────────────────────────────────

export const fetchCatalog = (id: string) =>
  createDeviceTrpcClient(id)["catalog.list"].query();

export const fetchBuyers = (id: string) =>
  createDeviceTrpcClient(id)["buyers.list"].query().then((d) => d.buyers);

export const fetchConsumption = (id: string) =>
  createDeviceTrpcClient(id)["reports.consumption"].query().then((d) => d.rows);

export const fetchSettings = (id: string) =>
  createDeviceTrpcClient(id)["admin.settings.get"].query();

// Admin endpoints
export const createBuyer = (id: string, buyerId: number, label: string) =>
  createDeviceTrpcClient(id)["admin.buyers.create"].mutate({ id: buyerId, label });

export const updateBuyer = (id: string, buyerId: number, label: string) =>
  createDeviceTrpcClient(id)["admin.buyers.update"].mutate({ id: buyerId, label });

export const deleteBuyer = (id: string, buyerId: number) =>
  createDeviceTrpcClient(id)["admin.buyers.delete"].mutate({ id: buyerId });

export const createCategory = (id: string, name: string, preorder: boolean, sortOrder: number) =>
  createDeviceTrpcClient(id)["admin.catalog.createCategory"].mutate({ name, preorder, sortOrder });

export const updateCategory = (
  id: string,
  catId: number,
  name: string,
  preorder: boolean,
  sortOrder: number,
) =>
  createDeviceTrpcClient(id)["admin.catalog.updateCategory"].mutate({
    id: catId,
    name,
    preorder,
    sortOrder,
  });

export const deleteCategory = (id: string, catId: number) =>
  createDeviceTrpcClient(id)["admin.catalog.deleteCategory"].mutate({ id: catId });

export const createItem = (
  id: string,
  categoryId: number,
  data: { name: string; quantity: string; price: string; dphRate: string; sortOrder: number },
) =>
  createDeviceTrpcClient(id)["admin.catalog.createItem"].mutate({ categoryId, ...data });

export const updateItem = (
  id: string,
  itemId: number,
  data: { name: string; quantity: string; price: string; dphRate: string; sortOrder: number },
) =>
  createDeviceTrpcClient(id)["admin.catalog.updateItem"].mutate({ id: itemId, ...data });

export const deleteItem = (id: string, itemId: number) =>
  createDeviceTrpcClient(id)["admin.catalog.deleteItem"].mutate({ id: itemId });

export const updateSettings = (id: string, settings: Partial<KioskSettings>) =>
  createDeviceTrpcClient(id)["admin.settings.update"].mutate(settings);

import type { KioskSettings } from "@kioskkit/shared";
