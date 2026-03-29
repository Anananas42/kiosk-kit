import { zodResolver } from "@hookform/resolvers/zod";
import { AdminItemCreateSchema } from "@kioskkit/shared";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  Spinner,
} from "@kioskkit/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
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

interface AddItemDialogProps {
  categoryId: number;
  nextSortOrder: number;
}

export function AddItemDialog({ categoryId, nextSortOrder }: AddItemDialogProps) {
  const [open, setOpen] = useState(false);
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
      form.reset({ categoryId, name: "", quantity: "", price: "", dphRate: "", sortOrder: 0 });
      setOpen(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
          <Plus className="size-3" />
          Add item
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          onSubmit={form.handleSubmit((data) =>
            createMutation.mutate({ ...data, categoryId, sortOrder: nextSortOrder }),
          )}
        >
          <DialogHeader>
            <DialogTitle>Add item</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <FieldGroup className="gap-3">
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
              <Field>
                <FieldLabel htmlFor={`add-item-qty-${categoryId}`}>Quantity</FieldLabel>
                <Input
                  id={`add-item-qty-${categoryId}`}
                  placeholder="e.g. 100g"
                  {...form.register("quantity")}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
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
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending && <Spinner className="mr-1" />}
              Add Item
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
