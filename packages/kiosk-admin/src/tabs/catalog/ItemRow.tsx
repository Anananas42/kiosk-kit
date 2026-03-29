import { type CatalogItem, formatCurrency, parsePrice } from "@kioskkit/shared";
import { Button, Collapsible, CollapsibleContent, CollapsibleTrigger } from "@kioskkit/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { queryKeys } from "../../lib/query.js";
import { trpc } from "../../trpc.js";
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
  const queryClient = useQueryClient();
  const invalidateCatalog = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.catalog.list() });

  const updateMutation = useMutation({
    mutationFn: (input: {
      id: number;
      name: string;
      quantity: string;
      price: string;
      dphRate: string;
      sortOrder: number;
    }) => trpc["admin.catalog.updateItem"].mutate(input),
    onSuccess: () => {
      invalidateCatalog();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleMoveUp() {
    const prev = adjacentItem.prev;
    if (!prev) return;
    updateMutation.mutate({
      id: Number(item.id),
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      dphRate: item.dphRate,
      sortOrder: prev.sortOrder,
    });
    updateMutation.mutate({
      id: Number(prev.id),
      name: prev.name,
      quantity: prev.quantity,
      price: prev.price,
      dphRate: prev.dphRate,
      sortOrder: item.sortOrder,
    });
  }

  function handleMoveDown() {
    const next = adjacentItem.next;
    if (!next) return;
    updateMutation.mutate({
      id: Number(item.id),
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      dphRate: item.dphRate,
      sortOrder: next.sortOrder,
    });
    updateMutation.mutate({
      id: Number(next.id),
      name: next.name,
      quantity: next.quantity,
      price: next.price,
      dphRate: next.dphRate,
      sortOrder: item.sortOrder,
    });
  }

  return (
    <div className="flex items-start gap-1 border-b border-border/50 last:border-b-0">
      <Collapsible open={open} onOpenChange={setOpen} className="flex-1">
        <CollapsibleTrigger className="flex w-full items-center gap-2 py-2 text-left text-sm hover:bg-muted/50">
          <span className="flex-1">
            {item.name}
            {item.quantity ? ` — ${item.quantity}` : ""}
            {item.price ? ` @ ${formatCurrency(parsePrice(item.price), locale, currency)}` : ""}
            {item.dphRate ? (
              <span className="ml-1 text-[0.85em] text-muted-foreground">
                ({item.dphRate}% DPH)
              </span>
            ) : null}
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ItemEditForm item={item} onClose={() => setOpen(false)} />
        </CollapsibleContent>
      </Collapsible>

      <div className="flex items-center gap-0.5 pt-1.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Move up"
          onClick={handleMoveUp}
          disabled={isFirst || updateMutation.isPending}
        >
          <ChevronUp className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Move down"
          onClick={handleMoveDown}
          disabled={isLast || updateMutation.isPending}
        >
          <ChevronDown className="size-4" />
        </Button>
      </div>
    </div>
  );
}
