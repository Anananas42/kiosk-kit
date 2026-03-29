import type { CatalogCategory } from "@kioskkit/shared";
import {
  AccordionHeader,
  AccordionTriggerPrimitive,
  Badge,
  Button,
  InlineEdit,
} from "@kioskkit/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { queryKeys } from "../../lib/query.js";
import { trpc } from "../../trpc.js";

interface CategoryTriggerProps {
  category: CatalogCategory;
  isFirst: boolean;
  isLast: boolean;
}

export function CategoryTrigger({ category, isFirst, isLast }: CategoryTriggerProps) {
  const queryClient = useQueryClient();
  const invalidateCatalog = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.catalog.list() });

  const updateMutation = useMutation({
    mutationFn: (input: { id: number; name: string; preorder: boolean; sortOrder: number }) =>
      trpc["admin.catalog.updateCategory"].mutate(input),
    onSuccess: () => {
      invalidateCatalog();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const moveMutation = useMutation({
    mutationFn: (input: { id: number; direction: "up" | "down" }) =>
      trpc["admin.catalog.moveCategory"].mutate(input),
    onSuccess: () => {
      invalidateCatalog();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleRename(newName: string) {
    updateMutation.mutate({
      id: Number(category.id),
      name: newName,
      preorder: category.preorder,
      sortOrder: category.sortOrder,
    });
  }

  return (
    <AccordionHeader className="flex">
      <AccordionTriggerPrimitive asChild>
        <div className="group flex flex-1 cursor-pointer items-center gap-2 rounded-md px-3 py-4 text-left text-sm font-medium outline-none transition-all hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 [&[data-state=open]_.chevron-icon]:rotate-180">
          <fieldset
            className="contents"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <InlineEdit
              value={category.name}
              onSave={handleRename}
              disabled={updateMutation.isPending}
            />
          </fieldset>

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
              aria-label="Move category up"
              disabled={isFirst || moveMutation.isPending}
              onClick={() => moveMutation.mutate({ id: Number(category.id), direction: "up" })}
            >
              <ArrowUp className="size-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              aria-label="Move category down"
              disabled={isLast || moveMutation.isPending}
              onClick={() => moveMutation.mutate({ id: Number(category.id), direction: "down" })}
            >
              <ArrowDown className="size-3" />
            </Button>
          </span>

          {category.preorder && <Badge variant="secondary">preorder</Badge>}

          <div className="flex-1" />

          <ChevronDown className="chevron-icon size-4 shrink-0 text-muted-foreground transition-transform duration-200" />
        </div>
      </AccordionTriggerPrimitive>
    </AccordionHeader>
  );
}
