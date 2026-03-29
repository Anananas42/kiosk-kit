import { type CatalogItem, formatCurrency, parsePrice } from "@kioskkit/shared";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@kioskkit/ui";
import { useState } from "react";
import { ItemEditForm } from "./ItemEditForm.js";

interface ItemRowProps {
  item: CatalogItem;
  locale: string;
  currency: string;
  isFirst: boolean;
  isLast: boolean;
  adjacentItem: { prev?: CatalogItem; next?: CatalogItem };
}

export function ItemRow({ item, locale, currency, isFirst, isLast, adjacentItem }: ItemRowProps) {
  const [open, setOpen] = useState(false);

  const formattedPrice = item.price
    ? formatCurrency(parsePrice(item.price), locale, currency)
    : "—";

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="grid w-full grid-cols-[1fr_auto_auto_auto] gap-x-4 border-b border-border/30 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/50">
        <span className="truncate">{item.name}</span>
        <span className="w-20 text-right text-muted-foreground">{item.quantity || "—"}</span>
        <span className="w-24 text-right">{formattedPrice}</span>
        <span className="w-16 text-right text-muted-foreground">
          {item.taxRate ? `${item.taxRate}%` : "—"}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ItemEditForm
          item={item}
          isFirst={isFirst}
          isLast={isLast}
          adjacentItem={adjacentItem}
          onClose={() => setOpen(false)}
        />
      </CollapsibleContent>
    </Collapsible>
  );
}
