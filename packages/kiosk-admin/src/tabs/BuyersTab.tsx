import { zodResolver } from "@hookform/resolvers/zod";
import { AdminBuyerCreateSchema, AdminBuyerUpdateSchema } from "@kioskkit/shared";
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
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { queryKeys } from "../lib/query.js";
import { trpc } from "../trpc.js";

type CreateInput = { id: number; label: string };
type UpdateInput = { id: number; label: string };

export function BuyersTab() {
  const queryClient = useQueryClient();
  const [editId, setEditId] = useState<number | null>(null);
  const editFormId = useId();
  const [deleteTarget, setDeleteTarget] = useState<{
    id: number;
    label: string;
  } | null>(null);

  const { data: buyers, isLoading } = useQuery({
    queryKey: queryKeys.buyers.list(),
    queryFn: () => trpc["buyers.list"].query().then((r) => r.buyers),
  });

  const invalidateBuyers = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.buyers.list() });

  const createMutation = useMutation({
    mutationFn: (input: CreateInput) => trpc["admin.buyers.create"].mutate(input),
    onSuccess: () => {
      toast.success("Buyer created");
      invalidateBuyers();
      createForm.reset();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: (input: UpdateInput) => trpc["admin.buyers.update"].mutate(input),
    onSuccess: () => {
      toast.success("Buyer updated");
      invalidateBuyers();
      setEditId(null);
      editForm.reset();
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

  const createForm = useForm<CreateInput>({
    resolver: zodResolver(AdminBuyerCreateSchema),
    defaultValues: { id: undefined as unknown as number, label: "" },
  });

  const editForm = useForm<UpdateInput>({
    resolver: zodResolver(AdminBuyerUpdateSchema),
  });

  const startEdit = (id: number, label: string) => {
    setEditId(id);
    editForm.reset({ id, label });
  };

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
              <TableHead className="w-40 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {buyers.map((b) => (
              <TableRow key={b.id}>
                {editId === b.id ? (
                  <>
                    <TableCell>#{b.id}</TableCell>
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
                        <Button
                          type="submit"
                          form={editFormId}
                          size="sm"
                          disabled={updateMutation.isPending}
                        >
                          {updateMutation.isPending ? <Spinner className="mr-1" /> : null}
                          Save
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setEditId(null)}>
                          Cancel
                        </Button>
                      </div>
                    </TableCell>
                  </>
                ) : (
                  <>
                    <TableCell>#{b.id}</TableCell>
                    <TableCell>{b.label}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => startEdit(b.id, b.label)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setDeleteTarget({ id: b.id, label: b.label })}
                          disabled={deleteMutation.isPending}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <h4 className="mt-6 mb-4 text-sm font-semibold">Add Buyer</h4>
      <form
        onSubmit={createForm.handleSubmit((data) => createMutation.mutate(data))}
        className="mb-2 flex flex-wrap items-center gap-2"
      >
        <div>
          <Input
            type="number"
            placeholder="ID"
            {...createForm.register("id", { valueAsNumber: true })}
            className="w-20"
          />
          {createForm.formState.errors.id && (
            <p className="mt-1 text-xs text-destructive">
              {createForm.formState.errors.id.message}
            </p>
          )}
        </div>
        <div>
          <Input
            type="text"
            placeholder="Label"
            {...createForm.register("label")}
            className="w-auto"
          />
          {createForm.formState.errors.label && (
            <p className="mt-1 text-xs text-destructive">
              {createForm.formState.errors.label.message}
            </p>
          )}
        </div>
        <Button type="submit" disabled={createMutation.isPending}>
          {createMutation.isPending ? <Spinner className="mr-1" /> : null}
          Add Buyer
        </Button>
      </form>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete buyer"
        description={
          deleteTarget ? `Delete buyer "${deleteTarget.label}" (#${deleteTarget.id})?` : ""
        }
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
      />
    </div>
  );
}
