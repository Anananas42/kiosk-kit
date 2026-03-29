import { formatCurrency, parsePrice } from "@kioskkit/shared";
import { Badge, Button, Card, CardContent, Input } from "@kioskkit/ui";
import { type FormEvent, useCallback, useState } from "react";
import { toast } from "sonner";
import { useData } from "../hooks.js";
import { trpc } from "../trpc.js";

export function CatalogTab() {
  const fetcher = useCallback(() => trpc["catalog.list"].query(), []);
  const { data: catalog, error, loading, reload } = useData(fetcher);
  const settingsFetcher = useCallback(() => trpc["admin.settings.get"].query(), []);
  const { data: settings } = useData(settingsFetcher);

  const locale = settings?.locale ?? "cs";
  const currency = settings?.currency ?? "CZK";

  const [catName, setCatName] = useState("");
  const [catPreorder, setCatPreorder] = useState(false);

  const [itemCatId, setItemCatId] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemQty, setItemQty] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [itemDph, setItemDph] = useState("");

  const handleAddCategory = (e: FormEvent) => {
    e.preventDefault();
    trpc["admin.catalog.createCategory"]
      .mutate({ name: catName, preorder: catPreorder, sortOrder: 0 })
      .then(() => {
        toast.success("Category created");
        setCatName("");
        setCatPreorder(false);
        reload();
      })
      .catch((err: Error) => toast.error(err.message));
  };

  const handleDeleteCategory = (id: number, name: string) => {
    if (!confirm(`Delete category "${name}"? All its items will also be deleted.`)) return;
    trpc["admin.catalog.deleteCategory"]
      .mutate({ id })
      .then(() => {
        toast.success("Category deleted");
        reload();
      })
      .catch((err: Error) => toast.error(err.message));
  };

  const handleAddItem = (e: FormEvent) => {
    e.preventDefault();
    trpc["admin.catalog.createItem"]
      .mutate({
        categoryId: Number(itemCatId),
        name: itemName,
        quantity: itemQty,
        price: itemPrice,
        taxRate: itemDph,
        sortOrder: 0,
      })
      .then(() => {
        toast.success("Item created");
        setItemName("");
        setItemQty("");
        setItemPrice("");
        setItemDph("");
        reload();
      })
      .catch((err: Error) => toast.error(err.message));
  };

  const handleDeleteItem = (id: number, name: string) => {
    if (!confirm(`Delete item "${name}"?`)) return;
    trpc["admin.catalog.deleteItem"]
      .mutate({ id })
      .then(() => {
        toast.success("Item deleted");
        reload();
      })
      .catch((err: Error) => toast.error(err.message));
  };

  if (loading) return <p className="text-muted-foreground">Loading...</p>;
  if (error) return <p className="text-destructive">Error: {error}</p>;

  return (
    <div>
      {catalog && catalog.length === 0 && (
        <p className="italic text-muted-foreground">No categories yet.</p>
      )}

      {catalog?.map((cat) => (
        <Card key={cat.id} className="mb-4 bg-secondary">
          <CardContent className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <strong>{cat.name}</strong>
              {cat.preorder && <Badge>preorder</Badge>}
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleDeleteCategory(Number(cat.id), cat.name)}
              >
                Delete
              </Button>
            </div>
            {cat.items.length > 0 ? (
              <ul className="m-0 list-none p-0">
                {cat.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between border-b border-border/50 py-1 last:border-b-0"
                  >
                    <span>
                      {item.name}
                      {item.quantity ? ` — ${item.quantity}` : ""}
                      {item.price
                        ? ` @ ${formatCurrency(parsePrice(item.price), locale, currency)}`
                        : ""}
                      {item.taxRate ? (
                        <span className="ml-1 text-[0.85em] text-muted-foreground">
                          ({item.taxRate}%)
                        </span>
                      ) : null}
                    </span>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteItem(Number(item.id), item.name)}
                    >
                      Delete
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="italic text-muted-foreground">No items in this category.</p>
            )}
          </CardContent>
        </Card>
      ))}

      <h4 className="mt-6 mb-4 text-sm font-semibold">Add Category</h4>
      <form onSubmit={handleAddCategory} className="mb-2 flex flex-wrap items-center gap-2">
        <Input
          type="text"
          placeholder="Category name"
          value={catName}
          onChange={(e) => setCatName(e.target.value)}
          required
          className="w-auto"
        />
        <label className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={catPreorder}
            onChange={(e) => setCatPreorder(e.target.checked)}
          />{" "}
          Preorder
        </label>
        <Button type="submit">Add Category</Button>
      </form>

      {catalog && catalog.length > 0 && (
        <>
          <h4 className="mt-6 mb-4 text-sm font-semibold">Add Item</h4>
          <form onSubmit={handleAddItem} className="mb-2 flex flex-wrap items-center gap-2">
            <select
              value={itemCatId}
              onChange={(e) => setItemCatId(e.target.value)}
              required
              className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            >
              <option value="">Select category</option>
              {catalog.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
            <Input
              type="text"
              placeholder="Name"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              required
              className="w-auto"
            />
            <Input
              type="text"
              placeholder="Quantity (e.g. 100g)"
              value={itemQty}
              onChange={(e) => setItemQty(e.target.value)}
              className="w-40"
            />
            <Input
              type="text"
              placeholder="Price (e.g. 12.50)"
              value={itemPrice}
              onChange={(e) => setItemPrice(e.target.value)}
              className="w-40"
            />
            <Input
              type="text"
              placeholder="DPH % (e.g. 21)"
              value={itemDph}
              onChange={(e) => setItemDph(e.target.value)}
              className="w-40"
            />
            <Button type="submit">Add Item</Button>
          </form>
        </>
      )}
    </div>
  );
}
