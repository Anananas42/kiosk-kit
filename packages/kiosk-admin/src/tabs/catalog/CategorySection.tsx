import type { CatalogCategory, CatalogItem } from "@kioskkit/shared";
import { AccordionContent, AccordionItem } from "@kioskkit/ui";
import { AddItemForm } from "./AddItemForm.js";
import { CategoryTrigger } from "./CategoryTrigger.js";
import { ItemRow } from "./ItemRow.js";

interface CategorySectionProps {
  category: CatalogCategory;
  locale: string;
  currency: string;
  isFirst: boolean;
  isLast: boolean;
  adjacentCategory: { prev?: CatalogCategory; next?: CatalogCategory };
}

export function CategorySection({
  category,
  locale,
  currency,
  isFirst,
  isLast,
  adjacentCategory,
}: CategorySectionProps) {
  const items = category.items;

  return (
    <AccordionItem value={category.id}>
      <CategoryTrigger
        category={category}
        isFirst={isFirst}
        isLast={isLast}
        adjacentCategory={adjacentCategory}
      />
      <AccordionContent>
        {items.length === 0 && (
          <p className="py-2 italic text-muted-foreground">No items in this category.</p>
        )}

        {items.map((item, index) => (
          <ItemRow
            key={item.id}
            item={item}
            locale={locale}
            currency={currency}
            isFirst={index === 0}
            isLast={index === items.length - 1}
            adjacentItem={getAdjacentItem(items, index)}
          />
        ))}

        <AddItemForm categoryId={Number(category.id)} nextSortOrder={getNextItemSortOrder(items)} />
      </AccordionContent>
    </AccordionItem>
  );
}

function getAdjacentItem(
  items: CatalogItem[],
  index: number,
): { prev?: CatalogItem; next?: CatalogItem } {
  return {
    prev: index > 0 ? items[index - 1] : undefined,
    next: index < items.length - 1 ? items[index + 1] : undefined,
  };
}

function getNextItemSortOrder(items: CatalogItem[]): number {
  if (items.length === 0) return 0;
  return Math.max(...items.map((i) => i.sortOrder)) + 1;
}
