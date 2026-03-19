import type { CatalogCategory, CatalogItem } from "@kioskkit/shared";

export interface LastOrder {
  buyer: number;
  buyerLabel: string;
  category: CatalogCategory;
  item: CatalogItem;
}
