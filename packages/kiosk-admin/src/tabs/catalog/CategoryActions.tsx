import type { CatalogCategory } from "@kioskkit/shared";
import { Button } from "@kioskkit/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "../../components/ConfirmDialog.js";
import { queryKeys } from "../../lib/query.js";
import { trpc } from "../../trpc.js";

interface CategoryActionsProps {
  category: CatalogCategory;
  isFirst: boolean;
  isLast: boolean;
  adjacentCategory: { prev?: CatalogCategory; next?: CatalogCategory };
}

export function CategoryActions({
  category,
  isFirst,
  isLast,
  adjacentCategory,
}: CategoryActionsProps) {
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

  function handleMoveUp() {
    const prev = adjacentCategory.prev;
    if (!prev) return;
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
    <div className="flex items-center gap-1 border-t border-border/50 pt-3 mt-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleMoveUp}
        disabled={isFirst || updateMutation.isPending}
        className="h-7 gap-1 text-xs"
      >
        <ArrowUp className="size-3" />
        Move up
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleMoveDown}
        disabled={isLast || updateMutation.isPending}
        className="h-7 gap-1 text-xs"
      >
        <ArrowDown className="size-3" />
        Move down
      </Button>

      <div className="flex-1" />

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 text-xs text-muted-foreground hover:text-destructive"
        onClick={() => setConfirmDelete(true)}
        disabled={deleteMutation.isPending}
      >
        <Trash2 className="size-3" />
        Delete category
      </Button>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete category"
        description={`Delete category "${category.name}"? All its items will also be deleted.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => deleteMutation.mutate(Number(category.id))}
      />
    </div>
  );
}
