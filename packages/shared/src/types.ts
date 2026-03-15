export interface Apartment {
  id: number;
  label: string;
}

export interface CatalogItem {
  id: string;
  name: string;
  quantity: string;
  price: string;
}

export interface CatalogCategory {
  id: string;
  name: string;
  pastry: boolean;
  items: CatalogItem[];
}

export interface RecordRequest {
  buyer: number;
  /** Signed count: positive = add, negative = remove. Always a nonzero integer. */
  count: number;
  category: string;
  item: string;
  itemId?: string;
  quantity?: string;
  price?: string;
}

export interface RecordEntry extends RecordRequest {
  id: string;
  timestamp: string;
  itemId: string;
  quantity: string;
  price: string;
}

export interface EvidenceRow {
  timestamp: string;
  buyer: number;
  /** Signed count read from Evidence "Operace" column. */
  count: number;
  category: string;
  item: string;
  itemId: string;
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

export interface ItemCountResponse {
  count: number;
}

/** Pastry ordering/delivery configuration per weekday. */
export interface PastryConfig {
  /** Whether ordering is allowed on each weekday (index 0=Sunday, 6=Saturday). */
  orderingDays: boolean[];
  /** Whether delivery happens on each weekday (index 0=Sunday, 6=Saturday). */
  deliveryDays: boolean[];
}
