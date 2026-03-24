import { type FormEvent, useCallback, useState } from "react";
import { useData, useFormStatus } from "../hooks.js";
import { trpc } from "../trpc.js";

export function BuyersTab() {
  const fetcher = useCallback(
    () => trpc["buyers.list"].query().then((r) => r.buyers),
    [],
  );
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

  if (loading) return <p className="msg-loading">Loading...</p>;
  if (error) return <p className="msg-error">Error: {error}</p>;

  return (
    <div>
      {form.error && <p className="msg-error">{form.error}</p>}
      {form.success && <p className="msg-success">{form.success}</p>}

      {buyers && buyers.length === 0 && <p className="empty-state">No buyers yet.</p>}

      {buyers?.map((b) => (
        <div key={b.id} className="buyer-row">
          {editId === b.id ? (
            <form onSubmit={handleEdit} className="form-row" style={{ flex: 1 }}>
              <span>#{b.id}</span>
              <input
                type="text"
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                required
                autoFocus
              />
              <button type="submit" className="btn btn-primary btn-sm">
                Save
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setEditId(null)}
              >
                Cancel
              </button>
            </form>
          ) : (
            <>
              <span style={{ minWidth: "3rem" }}>#{b.id}</span>
              <span style={{ flex: 1 }}>{b.label}</span>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setEditId(b.id);
                  setEditLabel(b.label);
                }}
              >
                Edit
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => handleDelete(b.id, b.label)}
              >
                Delete
              </button>
            </>
          )}
        </div>
      ))}

      <h4 className="section-heading">Add Buyer</h4>
      <form onSubmit={handleAdd} className="form-row">
        <input
          type="number"
          placeholder="ID"
          value={newId}
          onChange={(e) => setNewId(e.target.value)}
          required
          min="1"
          style={{ width: "5rem" }}
        />
        <input
          type="text"
          placeholder="Label"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          required
        />
        <button type="submit" className="btn btn-primary">
          Add Buyer
        </button>
      </form>
    </div>
  );
}
