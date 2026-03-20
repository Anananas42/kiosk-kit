import type {
  BuyersResponse,
  CatalogCategory,
  ItemCountResponse,
  KioskSettings,
  OverviewResponse,
  PreorderConfig,
  RecordRequest,
  RecordResponse,
} from "@kioskkit/shared";

async function fetchJson<T>(url: string, errorKey: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (body.error === errorKey) {
      const details = (body.details as string[])?.join("\n• ") ?? "";
      throw new Error(`${body.message}\n\n• ${details}`);
    }
    throw new Error(`${url} fetch failed: HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchCatalog(): Promise<CatalogCategory[]> {
  return fetchJson("/api/catalog", "catalog_invalid");
}

export async function fetchBuyers(): Promise<BuyersResponse> {
  return fetchJson("/api/buyers", "buyers_invalid");
}

export async function fetchHealth(): Promise<void> {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error(`Health check failed: HTTP ${res.status}`);
}

export async function fetchOverview(): Promise<OverviewResponse> {
  const res = await fetch("/api/overview");
  return res.json();
}

export async function fetchPreorderConfig(): Promise<PreorderConfig> {
  const res = await fetch("/api/preorder-config");
  return res.json();
}

export async function fetchSettings(): Promise<KioskSettings> {
  const res = await fetch("/api/settings");
  return res.json();
}

export async function fetchItemCount(
  buyer: number,
  item: string,
  itemId?: string,
): Promise<ItemCountResponse> {
  let url = `/api/item-count?buyer=${buyer}&item=${encodeURIComponent(item)}`;
  if (itemId) url += `&itemId=${encodeURIComponent(itemId)}`;
  const res = await fetch(url);
  return res.json();
}

export async function postRecord(data: RecordRequest): Promise<RecordResponse> {
  const res = await fetch("/api/record", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}
