import { type CatalogItem, formatCurrency, parsePrice } from "@kioskkit/shared";
import { Button, Collapsible, CollapsibleContent, CollapsibleTrigger } from "@kioskkit/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp } from "lucide-react";
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
}

export function ItemRow({ item, locale, currency, isFirst, isLast }: ItemRowProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const moveMutation = useMutation({
    mutationFn: (input: { id: number; direction: "up" | "down" }) =>
      trpc["admin.catalog.moveItem"].mutate(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.catalog.list() });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const formattedPrice = item.price
    ? formatCurrency(parsePrice(item.price), locale, currency)
    : "—";

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <div className="group grid w-full cursor-pointer grid-cols-[1fr_auto_auto_auto] gap-x-4 border-b border-border/30 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/50">
          <span className="flex items-center gap-1 truncate">
            {item.name}
            <span
              role="toolbar"
              className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                aria-label="Move up"
                disabled={isFirst || moveMutation.isPending}
                onClick={() => moveMutation.mutate({ id: Number(item.id), direction: "up" })}
              >
                <ArrowUp className="size-3" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                aria-label="Move down"
                disabled={isLast || moveMutation.isPending}
                onClick={() => moveMutation.mutate({ id: Number(item.id), direction: "down" })}
              >
                <ArrowDown className="size-3" />
              </Button>
            </span>
          </span>
          <span className="w-20 text-right text-muted-foreground">{item.quantity || "—"}</span>
          <span className="w-24 text-right">{formattedPrice}</span>
          <span className="w-16 text-right text-muted-foreground">
            {item.taxRate ? `${item.taxRate}%` : "—"}
          </span>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ItemEditForm item={item} onClose={() => setOpen(false)} />
      </CollapsibleContent>
    </Collapsible>
  );
}
