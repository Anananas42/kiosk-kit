import type {
  CatalogCategory,
  HealthResponse,
  OverviewResponse,
  RecordRequest,
  RecordResponse,
  ApartmentsResponse,
  ItemCountResponse,
  PastryConfig,
  KioskSettings,
} from '@kioskkit/shared';

export async function fetchCatalog(): Promise<CatalogCategory[]> {
  const res = await fetch('/api/catalog');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (body.error === 'catalog_invalid') {
      const details = (body.details as string[])?.join('\n• ') ?? '';
      throw new Error(`${body.message}\n\n• ${details}`);
    }
    throw new Error(`Catalog fetch failed: HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchApartments(): Promise<ApartmentsResponse> {
  const res = await fetch('/api/apartments');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (body.error === 'apartments_invalid') {
      const details = (body.details as string[])?.join('\n• ') ?? '';
      throw new Error(`${body.message}\n\n• ${details}`);
    }
    throw new Error(`Apartments fetch failed: HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch('/api/health');
  return res.json();
}

export async function fetchOverview(): Promise<OverviewResponse> {
  const res = await fetch('/api/overview');
  return res.json();
}

export async function fetchPastryConfig(): Promise<PastryConfig> {
  const res = await fetch('/api/pastry-config');
  return res.json();
}

export async function fetchSettings(): Promise<KioskSettings> {
  const res = await fetch('/api/settings');
  return res.json();
}

export async function fetchItemCount(buyer: number, item: string, itemId?: string): Promise<ItemCountResponse> {
  let url = `/api/item-count?buyer=${buyer}&item=${encodeURIComponent(item)}`;
  if (itemId) url += `&itemId=${encodeURIComponent(itemId)}`;
  const res = await fetch(url);
  return res.json();
}

export async function postRecord(data: RecordRequest): Promise<RecordResponse> {
  const res = await fetch('/api/record', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}
