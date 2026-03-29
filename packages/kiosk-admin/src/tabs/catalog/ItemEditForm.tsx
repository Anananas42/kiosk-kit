import { zodResolver } from "@hookform/resolvers/zod";
import { AdminItemUpdateSchema, type CatalogItem } from "@kioskkit/shared";
import { Button, Field, FieldError, FieldGroup, FieldLabel, Input, Spinner } from "@kioskkit/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ConfirmDialog } from "../../components/ConfirmDialog.js";
import { queryKeys } from "../../lib/query.js";
import { trpc } from "../../trpc.js";

type ItemUpdateInput = {
  id: number;
  name: string;
  quantity?: string;
  price?: string;
  dphRate?: string;
  sortOrder?: number;
};

interface ItemEditFormProps {
  item: CatalogItem;
  onClose: () => void;
}

export function ItemEditForm({ item, onClose }: ItemEditFormProps) {
  const queryClient = useQueryClient();
  const invalidateCatalog = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.catalog.list() });

  const [confirmDelete, setConfirmDelete] = useState(false);

  const form = useForm<ItemUpdateInput>({
    resolver: zodResolver(AdminItemUpdateSchema),
    defaultValues: {
      id: Number(item.id),
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      dphRate: item.dphRate,
      sortOrder: item.sortOrder,
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: ItemUpdateInput) => trpc["admin.catalog.updateItem"].mutate(input),
    onSuccess: () => {
      toast.success("Item updated");
      invalidateCatalog();
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => trpc["admin.catalog.deleteItem"].mutate({ id }),
    onSuccess: () => {
      toast.success("Item deleted");
      invalidateCatalog();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <form
      onSubmit={form.handleSubmit((data) => updateMutation.mutate(data))}
      className="space-y-4 py-3 pl-4"
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`item-name-${item.id}`}>Name</FieldLabel>
          <Input id={`item-name-${item.id}`} {...form.register("name")} />
          {form.formState.errors.name && (
            <FieldError>{form.formState.errors.name.message}</FieldError>
          )}
        </Field>

        <Field>
          <FieldLabel htmlFor={`item-quantity-${item.id}`}>Quantity</FieldLabel>
          <Input
            id={`item-quantity-${item.id}`}
            placeholder="e.g. 100g"
            {...form.register("quantity")}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor={`item-price-${item.id}`}>Price</FieldLabel>
          <Input
            id={`item-price-${item.id}`}
            placeholder="e.g. 12.50"
            {...form.register("price")}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor={`item-dph-${item.id}`}>DPH rate (%)</FieldLabel>
          <Input id={`item-dph-${item.id}`} placeholder="e.g. 21" {...form.register("dphRate")} />
        </Field>
      </FieldGroup>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={updateMutation.isPending}>
          {updateMutation.isPending && <Spinner className="mr-1" />}
          Save
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={() => setConfirmDelete(true)}
          disabled={deleteMutation.isPending}
        >
          {deleteMutation.isPending && <Spinner className="mr-1" />}
          Delete
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete item"
        description={`Delete item "${item.name}"?`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => deleteMutation.mutate(Number(item.id))}
      />
    </form>
  );
}
