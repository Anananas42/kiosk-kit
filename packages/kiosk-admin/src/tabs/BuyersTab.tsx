import { Button, Input } from "@kioskkit/ui";
import { type FormEvent, useCallback, useState } from "react";
import { useData, useFormStatus } from "../hooks.js";
import { trpc } from "../trpc.js";

export function BuyersTab() {
  const fetcher = useCallback(() => trpc["buyers.list"].query().then((r) => r.buyers), []);
  const { data: buyers, error, loading, reload } = useData(fetcher);
  const form = useFormStatus();

  const [newId, setNewId] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");

  const handleAdd = (e: FormEvent) => {
    e.preventDefault();
    form.clear();
    trpc["admin.buyers.create"]
      .mutate({ id: Number(newId), label: newLabel })
      .then(() => {
        form.setSuccess("Buyer created");
        setNewId("");
        setNewLabel("");
        reload();
      })
      .catch((err: Error) => form.setError(err.message));
  };

  const handleDelete = (id: number, label: string) => {
    if (!confirm(`Delete buyer "${label}" (#${id})?`)) return;
    form.clear();
    trpc["admin.buyers.delete"]
      .mutate({ id })
      .then(() => {
        form.setSuccess("Buyer deleted");
        reload();
      })
      .catch((err: Error) => form.setError(err.message));
  };

  const handleEdit = (e: FormEvent) => {
    e.preventDefault();
    if (editId === null) return;
    form.clear();
    trpc["admin.buyers.update"]
      .mutate({ id: editId, label: editLabel })
      .then(() => {
        form.setSuccess("Buyer updated");
        setEditId(null);
        setEditLabel("");
        reload();
      })
      .catch((err: Error) => form.setError(err.message));
  };

  if (loading) return <p className="text-muted-foreground">Loading...</p>;
  if (error) return <p className="text-destructive">Error: {error}</p>;

  return (
    <div>
      {form.error && <p className="my-2 text-destructive">{form.error}</p>}
      {form.success && <p className="my-2 text-success">{form.success}</p>}

      {buyers && buyers.length === 0 && (
        <p className="italic text-muted-foreground">No buyers yet.</p>
      )}

      {buyers?.map((b) => (
        <div key={b.id} className="flex items-center gap-2 border-b border-border/50 py-2">
          {editId === b.id ? (
            <form onSubmit={handleEdit} className="flex flex-1 flex-wrap items-center gap-2">
              <span>#{b.id}</span>
              <Input
                type="text"
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                required
                className="w-auto"
              />
              <Button type="submit" size="sm">
                Save
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setEditId(null)}>
                Cancel
              </Button>
            </form>
          ) : (
            <>
              <span className="min-w-12">#{b.id}</span>
              <span className="flex-1">{b.label}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditId(b.id);
                  setEditLabel(b.label);
                }}
              >
                Edit
              </Button>
              <Button variant="destructive" size="sm" onClick={() => handleDelete(b.id, b.label)}>
                Delete
              </Button>
            </>
          )}
        </div>
      ))}

      <h4 className="mt-6 mb-4 text-sm font-semibold">Add Buyer</h4>
      <form onSubmit={handleAdd} className="mb-2 flex flex-wrap items-center gap-2">
        <Input
          type="number"
          placeholder="ID"
          value={newId}
          onChange={(e) => setNewId(e.target.value)}
          required
          min="1"
          className="w-20"
        />
        <Input
          type="text"
          placeholder="Label"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          required
          className="w-auto"
        />
        <Button type="submit">Add Buyer</Button>
      </form>
    </div>
  );
}
