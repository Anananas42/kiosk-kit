import type { CatalogCategory } from "@kioskkit/shared";
import { AccordionChevron, AccordionHeader, Badge, InlineEdit } from "@kioskkit/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "../../lib/query.js";
import { trpc } from "../../trpc.js";

interface CategoryTriggerProps {
  category: CatalogCategory;
}

export function CategoryTrigger({ category }: CategoryTriggerProps) {
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

  return (
    <AccordionHeader className="flex items-center gap-2 py-4">
      <div className="flex flex-1 items-center gap-2">
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
      </div>

      <AccordionChevron />
    </AccordionHeader>
  );
}
