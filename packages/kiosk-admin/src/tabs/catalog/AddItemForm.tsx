import { zodResolver } from "@hookform/resolvers/zod";
import { AdminItemCreateSchema } from "@kioskkit/shared";
import { Button, Field, FieldError, FieldGroup, FieldLabel, Input, Spinner } from "@kioskkit/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { queryKeys } from "../../lib/query.js";
import { trpc } from "../../trpc.js";

type ItemCreateInput = {
  categoryId: number;
  name: string;
  quantity?: string;
  price?: string;
  dphRate?: string;
  sortOrder?: number;
};

interface AddItemFormProps {
  categoryId: number;
  nextSortOrder: number;
}

export function AddItemForm({ categoryId, nextSortOrder }: AddItemFormProps) {
  const queryClient = useQueryClient();
  const invalidateCatalog = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.catalog.list() });

  const form = useForm<ItemCreateInput>({
    resolver: zodResolver(AdminItemCreateSchema),
    defaultValues: {
      categoryId,
      name: "",
      quantity: "",
      price: "",
      dphRate: "",
      sortOrder: nextSortOrder,
    },
  });

  const createMutation = useMutation({
    mutationFn: (input: ItemCreateInput) => trpc["admin.catalog.createItem"].mutate(input),
    onSuccess: () => {
      toast.success("Item created");
      invalidateCatalog();
      form.reset({
        categoryId,
        name: "",
        quantity: "",
        price: "",
        dphRate: "",
        sortOrder: nextSortOrder + 1,
      });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <form
      onSubmit={form.handleSubmit((data) =>
        createMutation.mutate({ ...data, categoryId, sortOrder: nextSortOrder }),
      )}
      className="mt-3 space-y-3 border-t border-border/50 pt-3"
    >
      <p className="text-xs font-medium text-muted-foreground">Add item</p>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`add-item-name-${categoryId}`}>Name</FieldLabel>
          <Input
            id={`add-item-name-${categoryId}`}
            placeholder="Item name"
            {...form.register("name")}
          />
          {form.formState.errors.name && (
            <FieldError>{form.formState.errors.name.message}</FieldError>
          )}
        </Field>

        <div className="flex gap-2">
          <Field>
            <FieldLabel htmlFor={`add-item-qty-${categoryId}`}>Quantity</FieldLabel>
            <Input
              id={`add-item-qty-${categoryId}`}
              placeholder="e.g. 100g"
              {...form.register("quantity")}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor={`add-item-price-${categoryId}`}>Price</FieldLabel>
            <Input
              id={`add-item-price-${categoryId}`}
              placeholder="e.g. 12.50"
              {...form.register("price")}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor={`add-item-dph-${categoryId}`}>DPH %</FieldLabel>
            <Input
              id={`add-item-dph-${categoryId}`}
              placeholder="e.g. 21"
              {...form.register("dphRate")}
            />
          </Field>
        </div>
      </FieldGroup>

      <Button type="submit" size="sm" disabled={createMutation.isPending}>
        {createMutation.isPending && <Spinner className="mr-1" />}
        Add Item
      </Button>
    </form>
  );
}
