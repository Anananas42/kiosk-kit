import type { CatalogCategory } from "@kioskkit/shared";
import { Button } from "@kioskkit/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "../../components/ConfirmDialog.js";
import { queryKeys } from "../../lib/query.js";
import { trpc } from "../../trpc.js";

interface CategoryActionsProps {
  category: CatalogCategory;
}

export function CategoryActions({ category }: CategoryActionsProps) {
  const queryClient = useQueryClient();
  const invalidateCatalog = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.catalog.list() });

  const [confirmDelete, setConfirmDelete] = useState(false);

  const togglePreorderMutation = useMutation({
    mutationFn: () =>
      trpc["admin.catalog.updateCategory"].mutate({
        id: Number(category.id),
        name: category.name,
        preorder: !category.preorder,
        sortOrder: category.sortOrder,
      }),
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

  return (
    <div className="flex items-center gap-1 border-t border-border/50 pt-3 mt-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 gap-1 text-xs"
        onClick={() => togglePreorderMutation.mutate()}
        disabled={togglePreorderMutation.isPending}
      >
        <RefreshCw className="size-3" />
        {category.preorder ? "Switch to standard" : "Switch to preorder"}
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
