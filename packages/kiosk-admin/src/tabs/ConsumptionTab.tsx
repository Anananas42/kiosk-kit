import { useCallback } from "react";
import { useData } from "../hooks.js";
import { trpc } from "../trpc.js";

export function ConsumptionTab() {
  const fetcher = useCallback(() => trpc["reports.consumption"].query().then((r) => r.rows), []);
  const { data: rows, error, loading } = useData(fetcher);

  if (loading) return <p className="msg-loading">Loading...</p>;
  if (error) return <p className="msg-error">Error: {error}</p>;

  if (!rows || rows.length === 0) {
    return <p className="empty-state">No consumption data.</p>;
  }

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Category</th>
          <th>Item</th>
          <th>Qty</th>
          <th>Price</th>
          <th>By Buyer</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.itemId || r.item}>
            <td>{r.category}</td>
            <td>{r.item}</td>
            <td>{r.quantity}</td>
            <td>{r.price}</td>
            <td>
              {Object.entries(r.byBuyer)
                .map(([buyer, count]) => `#${buyer}: ${count}`)
                .join(", ") || "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
