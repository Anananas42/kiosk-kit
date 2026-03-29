import type { CatalogCategory } from "@kioskkit/shared";
import { AccordionTrigger, Badge, Button, InlineEdit } from "@kioskkit/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "../../components/ConfirmDialog.js";
import { queryKeys } from "../../lib/query.js";
import { trpc } from "../../trpc.js";

interface CategoryTriggerProps {
  category: CatalogCategory;
  isFirst: boolean;
  isLast: boolean;
  adjacentCategory: { prev?: CatalogCategory; next?: CatalogCategory };
}

export function CategoryTrigger({
  category,
  isFirst,
  isLast,
  adjacentCategory,
}: CategoryTriggerProps) {
  const queryClient = useQueryClient();
  const invalidateCatalog = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.catalog.list() });

  const [confirmDelete, setConfirmDelete] = useState(false);

  const updateMutation = useMutation({
    mutationFn: (input: { id: number; name: string; preorder: boolean; sortOrder: number }) =>
      trpc["admin.catalog.updateCategory"].mutate(input),
    onSuccess: () => {
      invalidateCatalog();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => trpc["admin.catalog.deleteCategory"].mutate({ id }),
    onSuccess: () => {
      toast.success("Category deleted");
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

  function handleTogglePreorder() {
    updateMutation.mutate({
      id: Number(category.id),
      name: category.name,
      preorder: !category.preorder,
      sortOrder: category.sortOrder,
    });
  }

  function handleMoveUp() {
    const prev = adjacentCategory.prev;
    if (!prev) return;
    // Swap sortOrder values
    updateMutation.mutate({
      id: Number(category.id),
      name: category.name,
      preorder: category.preorder,
      sortOrder: prev.sortOrder,
    });
    updateMutation.mutate({
      id: Number(prev.id),
      name: prev.name,
      preorder: prev.preorder,
      sortOrder: category.sortOrder,
    });
  }

  function handleMoveDown() {
    const next = adjacentCategory.next;
    if (!next) return;
    // Swap sortOrder values
    updateMutation.mutate({
      id: Number(category.id),
      name: category.name,
      preorder: category.preorder,
      sortOrder: next.sortOrder,
    });
    updateMutation.mutate({
      id: Number(next.id),
      name: next.name,
      preorder: next.preorder,
      sortOrder: category.sortOrder,
    });
  }

  return (
    <>
      <AccordionTrigger className="hover:no-underline">
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation prevents accordion toggle when interacting with controls */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: container prevents event bubbling */}
        <div className="flex flex-1 items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <InlineEdit
            value={category.name}
            onSave={handleRename}
            disabled={updateMutation.isPending}
          />

          <Badge
            className="cursor-pointer select-none"
            variant={category.preorder ? "default" : "outline"}
            onClick={handleTogglePreorder}
          >
            preorder
          </Badge>

          <div className="flex items-center gap-0.5">
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

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            aria-label="Delete category"
            onClick={() => setConfirmDelete(true)}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </AccordionTrigger>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete category"
        description={`Delete category "${category.name}"? All its items will also be deleted.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => deleteMutation.mutate(Number(category.id))}
      />
    </>
  );
}
