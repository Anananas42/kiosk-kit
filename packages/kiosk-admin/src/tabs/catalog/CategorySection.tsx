import type { CatalogCategory } from "@kioskkit/shared";
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
}

export function CategorySection({
  category,
  locale,
  currency,
  isFirst,
  isLast,
}: CategorySectionProps) {
  const items = category.items;

  return (
    <AccordionItem
      value={category.id}
      className="rounded-md border border-transparent last:border-b data-[state=open]:border-border"
    >
      <CategoryTrigger category={category} isFirst={isFirst} isLast={isLast} />
      <AccordionContent className="px-3 pb-3">
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

        <CategoryActions category={category} />
      </AccordionContent>
    </AccordionItem>
  );
}

function getNextItemSortOrder(items: CatalogCategory["items"]): number {
  if (items.length === 0) return 0;
  return Math.max(...items.map((i) => i.sortOrder)) + 1;
}
