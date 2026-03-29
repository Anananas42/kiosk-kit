import { zodResolver } from "@hookform/resolvers/zod";
import { AdminCategoryCreateSchema } from "@kioskkit/shared";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
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
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { queryKeys } from "../../lib/query.js";
import { trpc } from "../../trpc.js";

type CategoryCreateInput = {
  name: string;
  preorder?: boolean;
  sortOrder?: number;
};

interface AddCategoryDialogProps {
  nextSortOrder: number;
}

export function AddCategoryDialog({ nextSortOrder }: AddCategoryDialogProps) {
  const [open, setOpen] = useState(false);
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
      form.reset({ name: "", preorder: false, sortOrder: 0 });
      setOpen(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="mt-4 gap-1">
          <Plus className="size-4" />
          Add Category
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          onSubmit={form.handleSubmit((data) =>
            createMutation.mutate({ ...data, sortOrder: nextSortOrder }),
          )}
        >
          <DialogHeader>
            <DialogTitle>Add category</DialogTitle>
            <DialogDescription className="sr-only">Add a new catalog category</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <FieldGroup className="gap-3">
              <Field>
                <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
                <Input id={`${id}-name`} placeholder="Category name" {...form.register("name")} />
                {form.formState.errors.name && (
                  <FieldError>{form.formState.errors.name.message}</FieldError>
                )}
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" {...form.register("preorder")} />
                Preorder
              </label>
            </FieldGroup>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending && <Spinner className="mr-1" />}
              Add Category
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
