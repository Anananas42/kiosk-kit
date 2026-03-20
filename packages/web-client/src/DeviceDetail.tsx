import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import type { Buyer, CatalogCategory, KioskSettings } from "@kioskkit/shared";
import {
  type ConsumptionRow,
  createBuyer,
  createCategory,
  createItem,
  deleteBuyer,
  deleteCategory,
  deleteItem,
  fetchBuyers,
  fetchCatalog,
  fetchConsumption,
  fetchDeviceStatus,
  fetchSettings,
  updateBuyer,
  updateCategory,
  updateItem,
  updateSettings,
} from "./api.js";

type Tab = "catalog" | "buyers" | "consumption" | "settings";
const TABS: { key: Tab; label: string }[] = [
  { key: "catalog", label: "Catalog" },
  { key: "buyers", label: "Buyers" },
  { key: "consumption", label: "Consumption" },
  { key: "settings", label: "Settings" },
];

export function DeviceDetail() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>("catalog");
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchDeviceStatus(id).then(setOnline);
  }, [id]);

  if (!id) return <p>Missing device ID.</p>;

  return (
    <div>
      <Link to="/">&larr; Back to devices</Link>
      <h2>Device: {id.slice(0, 8)}...</h2>

      {online === null ? (
        <p>Checking device status...</p>
      ) : !online ? (
        <p style={{ color: "red", fontWeight: "bold" }}>
          Device is offline. Management is unavailable.
        </p>
      ) : null}

      <nav style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            style={{
              padding: "0.4rem 0.8rem",
              fontWeight: tab === t.key ? "bold" : "normal",
              borderBottom: tab === t.key ? "2px solid #333" : "2px solid transparent",
              background: "none",
              border: "none",
              borderBottomStyle: "solid",
              borderBottomWidth: 2,
              borderBottomColor: tab === t.key ? "#333" : "transparent",
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {online === false ? null : (
        <>
          {tab === "catalog" && <CatalogSection deviceId={id} />}
          {tab === "buyers" && <BuyersSection deviceId={id} />}
          {tab === "consumption" && <ConsumptionSection deviceId={id} />}
          {tab === "settings" && <SettingsSection deviceId={id} />}
        </>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

function useProxyData<T>(deviceId: string, fetcher: (id: string) => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    fetcher(deviceId)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [deviceId, fetcher]);

  useEffect(reload, [reload]);

  return { data, error, loading, reload };
}

function StatusMsg({ loading, error }: { loading: boolean; error: string | null }) {
  if (loading) return <p>Loading...</p>;
  if (error) return <p style={{ color: "red" }}>Error: {error}</p>;
  return null;
}

function FormStatus({ error, success }: { error: string | null; success: string | null }) {
  return (
    <>
      {error && <p style={{ color: "red" }}>{error}</p>}
      {success && <p style={{ color: "green" }}>{success}</p>}
    </>
  );
}

function useFormStatus() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const clear = () => {
    setError(null);
    setSuccess(null);
  };
  return { error, success, setError, setSuccess, clear };
}

// ── Catalog ─────────────────────────────────────────────────────────

function CatalogSection({ deviceId }: { deviceId: string }) {
  const { data: catalog, error, loading, reload } = useProxyData(deviceId, fetchCatalog);
  const form = useFormStatus();

  const [catName, setCatName] = useState("");
  const [catPreorder, setCatPreorder] = useState(false);

  const [itemCatId, setItemCatId] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemQty, setItemQty] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [itemDph, setItemDph] = useState("");

  const handleAddCategory = (e: FormEvent) => {
    e.preventDefault();
    form.clear();
    createCategory(deviceId, catName, catPreorder, 0)
      .then(() => {
        form.setSuccess("Category created");
        setCatName("");
        setCatPreorder(false);
        reload();
      })
      .catch((err) => form.setError(err.message));
  };

  const handleDeleteCategory = (id: number, name: string) => {
    if (!confirm(`Delete category "${name}"?`)) return;
    form.clear();
    deleteCategory(deviceId, id)
      .then(() => {
        form.setSuccess("Category deleted");
        reload();
      })
      .catch((err) => form.setError(err.message));
  };

  const handleAddItem = (e: FormEvent) => {
    e.preventDefault();
    form.clear();
    createItem(deviceId, Number(itemCatId), {
      name: itemName,
      quantity: itemQty,
      price: itemPrice,
      dphRate: itemDph,
      sortOrder: 0,
    })
      .then(() => {
        form.setSuccess("Item created");
        setItemName("");
        setItemQty("");
        setItemPrice("");
        setItemDph("");
        reload();
      })
      .catch((err) => form.setError(err.message));
  };

  const handleDeleteItem = (id: number, name: string) => {
    if (!confirm(`Delete item "${name}"?`)) return;
    form.clear();
    deleteItem(deviceId, id)
      .then(() => {
        form.setSuccess("Item deleted");
        reload();
      })
      .catch((err) => form.setError(err.message));
  };

  return (
    <div>
      <h3>Catalog</h3>
      <StatusMsg loading={loading} error={error} />
      <FormStatus error={form.error} success={form.success} />

      {catalog && (
        <>
          {catalog.length === 0 ? (
            <p>No categories.</p>
          ) : (
            catalog.map((cat) => (
              <div key={cat.id} style={{ marginBottom: "1rem", paddingLeft: "0.5rem", borderLeft: "2px solid #ddd" }}>
                <strong>{cat.name}</strong> {cat.preorder ? "(preorder)" : ""}
                <button type="button" style={{ marginLeft: "0.5rem" }} onClick={() => handleDeleteCategory(Number(cat.id), cat.name)}>
                  Delete
                </button>
                {cat.items.length > 0 && (
                  <ul style={{ margin: "0.25rem 0", paddingLeft: "1.5rem" }}>
                    {cat.items.map((item) => (
                      <li key={item.id}>
                        {item.name} - {item.quantity} @ {item.price}
                        <button type="button" style={{ marginLeft: "0.5rem" }} onClick={() => handleDeleteItem(Number(item.id), item.name)}>
                          Delete
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))
          )}

          <h4>Add Category</h4>
          <form onSubmit={handleAddCategory} style={{ marginBottom: "1rem" }}>
            <input placeholder="Name" value={catName} onChange={(e) => setCatName(e.target.value)} required style={{ marginRight: "0.5rem" }} />
            <label style={{ marginRight: "0.5rem" }}>
              <input type="checkbox" checked={catPreorder} onChange={(e) => setCatPreorder(e.target.checked)} /> Preorder
            </label>
            <button type="submit">Add</button>
          </form>

          <h4>Add Item</h4>
          <form onSubmit={handleAddItem}>
            <select value={itemCatId} onChange={(e) => setItemCatId(e.target.value)} required style={{ marginRight: "0.5rem" }}>
              <option value="">Select category</option>
              {catalog.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
            <input placeholder="Name" value={itemName} onChange={(e) => setItemName(e.target.value)} required style={{ marginRight: "0.5rem" }} />
            <input placeholder="Quantity" value={itemQty} onChange={(e) => setItemQty(e.target.value)} style={{ marginRight: "0.5rem", width: "5rem" }} />
            <input placeholder="Price" value={itemPrice} onChange={(e) => setItemPrice(e.target.value)} style={{ marginRight: "0.5rem", width: "5rem" }} />
            <input placeholder="DPH Rate" value={itemDph} onChange={(e) => setItemDph(e.target.value)} style={{ marginRight: "0.5rem", width: "5rem" }} />
            <button type="submit">Add</button>
          </form>
        </>
      )}
    </div>
  );
}

// ── Buyers ──────────────────────────────────────────────────────────

function BuyersSection({ deviceId }: { deviceId: string }) {
  const { data: buyers, error, loading, reload } = useProxyData(deviceId, fetchBuyers);
  const form = useFormStatus();

  const [newId, setNewId] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");

  const handleAdd = (e: FormEvent) => {
    e.preventDefault();
    form.clear();
    createBuyer(deviceId, Number(newId), newLabel)
      .then(() => {
        form.setSuccess("Buyer created");
        setNewId("");
        setNewLabel("");
        reload();
      })
      .catch((err) => form.setError(err.message));
  };

  const handleDelete = (id: number, label: string) => {
    if (!confirm(`Delete buyer "${label}"?`)) return;
    form.clear();
    deleteBuyer(deviceId, id)
      .then(() => {
        form.setSuccess("Buyer deleted");
        reload();
      })
      .catch((err) => form.setError(err.message));
  };

  const handleEdit = (e: FormEvent) => {
    e.preventDefault();
    if (editId === null) return;
    form.clear();
    updateBuyer(deviceId, editId, editLabel)
      .then(() => {
        form.setSuccess("Buyer updated");
        setEditId(null);
        setEditLabel("");
        reload();
      })
      .catch((err) => form.setError(err.message));
  };

  return (
    <div>
      <h3>Buyers</h3>
      <StatusMsg loading={loading} error={error} />
      <FormStatus error={form.error} success={form.success} />

      {buyers && (
        <>
          {buyers.length === 0 ? (
            <p>No buyers.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0 }}>
              {buyers.map((b) => (
                <li key={b.id} style={{ padding: "0.25rem 0", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span>#{b.id} - {b.label}</span>
                  <button type="button" onClick={() => { setEditId(b.id); setEditLabel(b.label); }}>Edit</button>
                  <button type="button" onClick={() => handleDelete(b.id, b.label)}>Delete</button>
                </li>
              ))}
            </ul>
          )}

          {editId !== null && (
            <form onSubmit={handleEdit} style={{ marginBottom: "1rem" }}>
              <strong>Edit buyer #{editId}: </strong>
              <input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} required style={{ marginRight: "0.5rem" }} />
              <button type="submit">Save</button>
              <button type="button" onClick={() => setEditId(null)} style={{ marginLeft: "0.5rem" }}>Cancel</button>
            </form>
          )}

          <h4>Add Buyer</h4>
          <form onSubmit={handleAdd}>
            <input placeholder="ID (number)" value={newId} onChange={(e) => setNewId(e.target.value)} required type="number" min="1" style={{ marginRight: "0.5rem", width: "5rem" }} />
            <input placeholder="Label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} required style={{ marginRight: "0.5rem" }} />
            <button type="submit">Add</button>
          </form>
        </>
      )}
    </div>
  );
}

// ── Consumption ─────────────────────────────────────────────────────

function ConsumptionSection({ deviceId }: { deviceId: string }) {
  const { data: rows, error, loading } = useProxyData(deviceId, fetchConsumption);

  return (
    <div>
      <h3>Consumption Report</h3>
      <StatusMsg loading={loading} error={error} />

      {rows && (
        rows.length === 0 ? (
          <p>No consumption data.</p>
        ) : (
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={thStyle}>Category</th>
                <th style={thStyle}>Item</th>
                <th style={thStyle}>Qty</th>
                <th style={thStyle}>Price</th>
                <th style={thStyle}>By Buyer</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.itemId || r.item}>
                  <td style={tdStyle}>{r.category}</td>
                  <td style={tdStyle}>{r.item}</td>
                  <td style={tdStyle}>{r.quantity}</td>
                  <td style={tdStyle}>{r.price}</td>
                  <td style={tdStyle}>
                    {Object.entries(r.byBuyer)
                      .map(([buyer, count]) => `#${buyer}: ${count}`)
                      .join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
    </div>
  );
}

const thStyle = { textAlign: "left" as const, borderBottom: "1px solid #ccc", padding: "0.25rem 0.5rem" };
const tdStyle = { borderBottom: "1px solid #eee", padding: "0.25rem 0.5rem" };

// ── Settings ────────────────────────────────────────────────────────

function SettingsSection({ deviceId }: { deviceId: string }) {
  const { data: settings, error, loading, reload } = useProxyData(deviceId, fetchSettings);
  const form = useFormStatus();
  const [draft, setDraft] = useState<KioskSettings | null>(null);

  useEffect(() => {
    if (settings) setDraft({ ...settings });
  }, [settings]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    form.clear();
    updateSettings(deviceId, draft)
      .then(() => {
        form.setSuccess("Settings saved");
        reload();
      })
      .catch((err) => form.setError(err.message));
  };

  const set = <K extends keyof KioskSettings>(key: K, value: KioskSettings[K]) =>
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));

  return (
    <div>
      <h3>Settings</h3>
      <StatusMsg loading={loading} error={error} />
      <FormStatus error={form.error} success={form.success} />

      {draft && (
        <form onSubmit={handleSubmit}>
          <div style={fieldStyle}>
            <label>Idle Dim (ms): </label>
            <input type="number" value={draft.idleDimMs} onChange={(e) => set("idleDimMs", Number(e.target.value))} />
          </div>
          <div style={fieldStyle}>
            <label>Inactivity Timeout (ms): </label>
            <input type="number" value={draft.inactivityTimeoutMs} onChange={(e) => set("inactivityTimeoutMs", Number(e.target.value))} />
          </div>
          <div style={fieldStyle}>
            <label>
              <input type="checkbox" checked={draft.maintenance} onChange={(e) => set("maintenance", e.target.checked)} /> Maintenance Mode
            </label>
          </div>
          <div style={fieldStyle}>
            <label>Locale: </label>
            <input value={draft.locale} onChange={(e) => set("locale", e.target.value)} style={{ width: "4rem" }} />
          </div>
          <div style={fieldStyle}>
            <label>Currency: </label>
            <input value={draft.currency} onChange={(e) => set("currency", e.target.value)} style={{ width: "4rem" }} />
          </div>
          <div style={fieldStyle}>
            <label>Buyer Noun: </label>
            <input value={draft.buyerNoun} onChange={(e) => set("buyerNoun", e.target.value)} />
          </div>
          <button type="submit" style={{ marginTop: "0.5rem" }}>Save Settings</button>
        </form>
      )}
    </div>
  );
}

const fieldStyle = { marginBottom: "0.5rem" };
