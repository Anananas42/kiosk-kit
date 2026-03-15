import type {
  CatalogCategory,
  HealthResponse,
  OverviewResponse,
  RecordRequest,
  RecordResponse,
  ApartmentsResponse,
  ItemCountResponse,
} from '@zahumny/shared';

export async function fetchCatalog(): Promise<CatalogCategory[]> {
  const res = await fetch('/api/catalog');
  return res.json();
}

export async function fetchApartments(): Promise<ApartmentsResponse> {
  const res = await fetch('/api/apartments');
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

export async function fetchItemCount(buyer: number, item: string): Promise<ItemCountResponse> {
  const res = await fetch(`/api/item-count?buyer=${buyer}&item=${encodeURIComponent(item)}`);
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
