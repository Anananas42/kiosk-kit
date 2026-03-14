export interface Apartment {
  id: number;
  label: string;
}

export interface CatalogItem {
  name: string;
  quantity: string;
  price: string;
}

export interface CatalogCategory {
  id: string;
  name: string;
  items: CatalogItem[];
}

export interface RecordRequest {
  buyer: number;
  delta: 1 | -1;
  category: string;
  item: string;
  quantity?: string;
  price?: string;
}

export interface RecordEntry extends RecordRequest {
  id: string;
  timestamp: string;
  quantity: string;
  price: string;
}

export interface EvidenceRow {
  timestamp: string;
  buyer: number;
  delta: 1 | -1;
  category: string;
  item: string;
  quantity: string;
  price: string;
}

export interface HealthResponse {
  online: boolean;
  queued: number;
}

export interface RecordResponse {
  ok?: boolean;
  queued?: boolean;
  error?: string;
}

export interface OverviewResponse {
  records: EvidenceRow[];
}

export interface ApartmentsResponse {
  apartments: Apartment[];
}
