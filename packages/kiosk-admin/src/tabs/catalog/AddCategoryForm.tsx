import { zodResolver } from "@hookform/resolvers/zod";
import { AdminCategoryCreateSchema } from "@kioskkit/shared";
import { Button, Field, FieldError, FieldGroup, FieldLabel, Input, Spinner } from "@kioskkit/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { queryKeys } from "../../lib/query.js";
import { trpc } from "../../trpc.js";

type CategoryCreateInput = {
  name: string;
  preorder?: boolean;
  sortOrder?: number;
};

interface AddCategoryFormProps {
  nextSortOrder: number;
}

export function AddCategoryForm({ nextSortOrder }: AddCategoryFormProps) {
  const id = useId();
  const queryClient = useQueryClient();
  const invalidateCatalog = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.catalog.list() });

  const form = useForm<CategoryCreateInput>({
    resolver: zodResolver(AdminCategoryCreateSchema),
    defaultValues: {
      name: "",
      preorder: false,
      sortOrder: nextSortOrder,
    },
  });

  const createMutation = useMutation({
    mutationFn: (input: CategoryCreateInput) => trpc["admin.catalog.createCategory"].mutate(input),
    onSuccess: () => {
      toast.success("Category created");
      invalidateCatalog();
      form.reset({
        name: "",
        preorder: false,
        sortOrder: nextSortOrder + 1,
      });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <form
      onSubmit={form.handleSubmit((data) =>
        createMutation.mutate({ ...data, sortOrder: nextSortOrder }),
      )}
      className="mt-6"
    >
      <h4 className="mb-4 text-sm font-semibold">Add Category</h4>
      <FieldGroup>
        <div className="flex items-end gap-2">
          <Field>
            <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
            <Input id={`${id}-name`} placeholder="Category name" {...form.register("name")} />
            {form.formState.errors.name && (
              <FieldError>{form.formState.errors.name.message}</FieldError>
            )}
          </Field>

          <label className="flex items-center gap-1.5 pb-2 text-sm">
            <input type="checkbox" {...form.register("preorder")} />
            Preorder
          </label>

          <Button type="submit" disabled={createMutation.isPending} className="mb-0.5">
            {createMutation.isPending && <Spinner className="mr-1" />}
            Add Category
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
