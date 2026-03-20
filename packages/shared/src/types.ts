export interface Buyer {
  id: number;
  label: string;
}

export interface CatalogItem {
  id: string;
  name: string;
  quantity: string;
  price: string;
  dphRate: string;
}

export interface CatalogCategory {
  id: string;
  name: string;
  preorder: boolean;
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

export interface RecordRow {
  timestamp: string;
  buyer: number;
  /** Signed count: positive = add, negative = remove */
  count: number;
  category: string;
  item: string;
  itemId: string;
  quantity: string;
  price: string;
}

export interface HealthResponse {
  online: boolean;
}

export interface RecordResponse {
  ok?: boolean;
  error?: string;
}

export interface OverviewResponse {
  records: RecordRow[];
}

export interface BuyersResponse {
  buyers: Buyer[];
}

export interface ItemCountResponse {
  count: number;
}

/** Kiosk settings (configurable via admin API). */
export interface KioskSettings {
  /** Display dim overlay timeout in milliseconds. */
  idleDimMs: number;
  /** Inactivity timeout before resetting to home screen, in milliseconds. */
  inactivityTimeoutMs: number;
  /** When true, show maintenance screen and block all interaction. */
  maintenance: boolean;
  /** UI locale code (e.g. "cs", "en"). */
  locale: string;
  /** ISO 4217 currency code (e.g. "CZK", "EUR"). */
  currency: string;
  /** Display noun for the buyer entity (e.g. "apartmán", "room"). */
  buyerNoun: string;
}

/** Preorder ordering/delivery configuration per weekday. */
export interface PreorderConfig {
  /** Whether ordering is allowed on each weekday (index 0=Sunday, 6=Saturday). */
  orderingDays: boolean[];
  /** Whether delivery happens on each weekday (index 0=Sunday, 6=Saturday). */
  deliveryDays: boolean[];
}
