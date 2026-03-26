import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@kioskkit/ui";
import { useCallback } from "react";
import { useData } from "../hooks.js";
import { trpc } from "../trpc.js";

export function ConsumptionTab() {
  const fetcher = useCallback(() => trpc["reports.consumption"].query().then((r) => r.rows), []);
  const { data: rows, error, loading } = useData(fetcher);

  if (loading) return <p className="text-muted-foreground">Loading...</p>;
  if (error) return <p className="text-destructive">Error: {error}</p>;

  if (!rows || rows.length === 0) {
    return <p className="italic text-muted-foreground">No consumption data.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Category</TableHead>
          <TableHead>Item</TableHead>
          <TableHead>Qty</TableHead>
          <TableHead>Price</TableHead>
          <TableHead>By Buyer</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.itemId || r.item}>
            <TableCell>{r.category}</TableCell>
            <TableCell>{r.item}</TableCell>
            <TableCell>{r.quantity}</TableCell>
            <TableCell>{r.price}</TableCell>
            <TableCell>
              {Object.entries(r.byBuyer)
                .map(([buyer, count]) => `#${buyer}: ${count}`)
                .join(", ") || "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
