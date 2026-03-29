import type { CatalogCategory, CatalogItem } from "@kioskkit/shared";
import { AccordionContent, AccordionItem } from "@kioskkit/ui";
import { AddItemDialog } from "./AddItemDialog.js";
import { CategoryActions } from "./CategoryActions.js";
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
      <CategoryTrigger category={category} />
      <AccordionContent>
        {items.length === 0 && (
          <p className="py-2 italic text-muted-foreground">No items in this category.</p>
        )}

        {items.length > 0 && (
          <div className="rounded-md border">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 border-b bg-muted/50 px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <span>Name</span>
              <span className="w-20 text-right">Qty</span>
              <span className="w-24 text-right">Price</span>
              <span className="w-16 text-right">DPH</span>
            </div>
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
          </div>
        )}

        <div className="mt-3">
          <AddItemDialog
            categoryId={Number(category.id)}
            nextSortOrder={getNextItemSortOrder(items)}
          />
        </div>

        <CategoryActions
          category={category}
          isFirst={isFirst}
          isLast={isLast}
          adjacentCategory={adjacentCategory}
        />
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
