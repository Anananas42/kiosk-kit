import { type FormEvent, useCallback, useState } from "react";
import { useData, useFormStatus } from "../hooks.js";
import { trpc } from "../trpc.js";

export function CatalogTab() {
  const fetcher = useCallback(() => trpc["catalog.list"].query(), []);
  const { data: catalog, error, loading, reload } = useData(fetcher);
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
    trpc["admin.catalog.createCategory"]
      .mutate({ name: catName, preorder: catPreorder, sortOrder: 0 })
      .then(() => {
        form.setSuccess("Category created");
        setCatName("");
        setCatPreorder(false);
        reload();
      })
      .catch((err: Error) => form.setError(err.message));
  };

  const handleDeleteCategory = (id: number, name: string) => {
    if (!confirm(`Delete category "${name}"? All its items will also be deleted.`)) return;
    form.clear();
    trpc["admin.catalog.deleteCategory"]
      .mutate({ id })
      .then(() => {
        form.setSuccess("Category deleted");
        reload();
      })
      .catch((err: Error) => form.setError(err.message));
  };

  const handleAddItem = (e: FormEvent) => {
    e.preventDefault();
    form.clear();
    trpc["admin.catalog.createItem"]
      .mutate({
        categoryId: Number(itemCatId),
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
      .catch((err: Error) => form.setError(err.message));
  };

  const handleDeleteItem = (id: number, name: string) => {
    if (!confirm(`Delete item "${name}"?`)) return;
    form.clear();
    trpc["admin.catalog.deleteItem"]
      .mutate({ id })
      .then(() => {
        form.setSuccess("Item deleted");
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

      {catalog && catalog.length === 0 && <p className="empty-state">No categories yet.</p>}

      {catalog?.map((cat) => (
        <div key={cat.id} className="category-card">
          <div className="category-header">
            <strong>{cat.name}</strong>
            {cat.preorder && <span className="badge">preorder</span>}
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => handleDeleteCategory(Number(cat.id), cat.name)}
            >
              Delete
            </button>
          </div>
          {cat.items.length > 0 ? (
            <ul className="item-list">
              {cat.items.map((item) => (
                <li key={item.id} className="item-row">
                  <span>
                    {item.name}
                    {item.quantity ? ` — ${item.quantity}` : ""}
                    {item.price ? ` @ ${item.price}` : ""}
                    {item.dphRate ? (
                      <span style={{ color: "#888", fontSize: "0.85em", marginLeft: "0.25em" }}>
                        ({item.dphRate}% DPH)
                      </span>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => handleDeleteItem(Number(item.id), item.name)}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-state">No items in this category.</p>
          )}
        </div>
      ))}

      <h4 className="section-heading">Add Category</h4>
      <form onSubmit={handleAddCategory} className="form-row">
        <input
          type="text"
          placeholder="Category name"
          value={catName}
          onChange={(e) => setCatName(e.target.value)}
          required
        />
        <label>
          <input
            type="checkbox"
            checked={catPreorder}
            onChange={(e) => setCatPreorder(e.target.checked)}
          />{" "}
          Preorder
        </label>
        <button type="submit" className="btn btn-primary">
          Add Category
        </button>
      </form>

      {catalog && catalog.length > 0 && (
        <>
          <h4 className="section-heading">Add Item</h4>
          <form onSubmit={handleAddItem} className="form-row">
            <select value={itemCatId} onChange={(e) => setItemCatId(e.target.value)} required>
              <option value="">Select category</option>
              {catalog.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Name"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              required
            />
            <input
              type="text"
              placeholder="e.g. 100g"
              value={itemQty}
              onChange={(e) => setItemQty(e.target.value)}
              style={{ width: "6rem" }}
            />
            <input
              type="text"
              placeholder="e.g. 12.50"
              value={itemPrice}
              onChange={(e) => setItemPrice(e.target.value)}
              style={{ width: "6rem" }}
            />
            <input
              type="text"
              placeholder="e.g. 21"
              value={itemDph}
              onChange={(e) => setItemDph(e.target.value)}
              style={{ width: "6rem" }}
            />
            <button type="submit" className="btn btn-primary">
              Add Item
            </button>
          </form>
        </>
      )}
    </div>
  );
}
