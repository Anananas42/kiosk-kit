import { zodResolver } from "@hookform/resolvers/zod";
import { AdminBuyerCreateSchema, AdminBuyerUpdateSchema, type Buyer } from "@kioskkit/shared";
import {
  Button,
  Input,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@kioskkit/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { queryKeys } from "../lib/query.js";
import { trpc } from "../trpc.js";

type CreateInput = { id: number; label: string };
type UpdateInput = { id: number; label: string };

function useInvalidateBuyers() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.buyers.list() });
}

function BuyerRow({ buyer }: { buyer: Buyer }) {
  const invalidateBuyers = useInvalidateBuyers();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const editFormId = useId();

  const editForm = useForm<UpdateInput>({
    resolver: zodResolver(AdminBuyerUpdateSchema),
    defaultValues: { id: buyer.id, label: buyer.label },
  });

  const updateMutation = useMutation({
    mutationFn: (input: UpdateInput) => trpc["admin.buyers.update"].mutate(input),
    onSuccess: () => {
      toast.success("Buyer updated");
      invalidateBuyers();
      setEditing(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => trpc["admin.buyers.delete"].mutate({ id }),
    onSuccess: () => {
      toast.success("Buyer deleted");
      invalidateBuyers();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const startEdit = () => {
    editForm.reset({ id: buyer.id, label: buyer.label });
    setEditing(true);
  };

  if (editing) {
    return (
      <TableRow>
        <TableCell>#{buyer.id}</TableCell>
        <TableCell>
          <form
            id={editFormId}
            onSubmit={editForm.handleSubmit((data) => updateMutation.mutate(data))}
          >
            <Input {...editForm.register("label")} className="w-auto" />
            {editForm.formState.errors.label && (
              <p className="mt-1 text-xs text-destructive">
                {editForm.formState.errors.label.message}
              </p>
            )}
          </form>
        </TableCell>
        <TableCell className="text-right">
          <div className="flex justify-end gap-1">
            <Button type="submit" form={editFormId} size="sm" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? <Spinner className="mr-1" /> : null}
              Save
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell>#{buyer.id}</TableCell>
      <TableCell>{buyer.label}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Edit"
            onClick={startEdit}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            aria-label="Delete"
            onClick={() => setConfirmDelete(true)}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </TableCell>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete buyer"
        description={`Delete buyer "${buyer.label}" (#${buyer.id})?`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => deleteMutation.mutate(buyer.id)}
      />
    </TableRow>
  );
}

function AddBuyerForm() {
  const invalidateBuyers = useInvalidateBuyers();

  const form = useForm<CreateInput>({
    resolver: zodResolver(AdminBuyerCreateSchema),
    defaultValues: { id: "" as unknown as number, label: "" },
  });

  const createMutation = useMutation({
    mutationFn: (input: CreateInput) => trpc["admin.buyers.create"].mutate(input),
    onSuccess: () => {
      toast.success("Buyer created");
      invalidateBuyers();
      form.reset();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <>
      <h4 className="mt-6 mb-4 text-sm font-semibold">Add Buyer</h4>
      <form
        onSubmit={form.handleSubmit((data) => createMutation.mutate(data))}
        className="mb-2 flex flex-wrap items-center gap-2"
      >
        <div>
          <Input
            type="number"
            placeholder="ID"
            {...form.register("id", { valueAsNumber: true })}
            min="1"
            className="w-20"
          />
          {form.formState.errors.id && (
            <p className="mt-1 text-xs text-destructive">
              {form.formState.errors.id.type === "invalid_type"
                ? "ID is required"
                : form.formState.errors.id.message}
            </p>
          )}
        </div>
        <div>
          <Input type="text" placeholder="Label" {...form.register("label")} className="w-auto" />
          {form.formState.errors.label && (
            <p className="mt-1 text-xs text-destructive">{form.formState.errors.label.message}</p>
          )}
        </div>
        <Button type="submit" disabled={createMutation.isPending}>
          {createMutation.isPending ? <Spinner className="mr-1" /> : null}
          Add Buyer
        </Button>
      </form>
    </>
  );
}

export function BuyersTab() {
  const { data: buyers, isLoading } = useQuery({
    queryKey: queryKeys.buyers.list(),
    queryFn: () => trpc["buyers.list"].query().then((r) => r.buyers),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted-foreground">
        <Spinner /> Loading buyers...
      </div>
    );
  }

  return (
    <div>
      {buyers && buyers.length === 0 && (
        <p className="py-4 italic text-muted-foreground">No buyers yet.</p>
      )}

      {buyers && buyers.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">ID</TableHead>
              <TableHead>Label</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {buyers.map((b) => (
              <BuyerRow key={b.id} buyer={b} />
            ))}
          </TableBody>
        </Table>
      )}

      <AddBuyerForm />
    </div>
  );
}
