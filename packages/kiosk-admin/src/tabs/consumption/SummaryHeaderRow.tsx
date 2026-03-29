import type { Buyer } from "@kioskkit/shared";
import { TableHead, TableHeader, TableRow } from "@kioskkit/ui";

interface SummaryHeaderRowProps {
  buyers: Buyer[];
}

export function SummaryHeaderRow({ buyers }: SummaryHeaderRowProps) {
  return (
    <TableHeader>
      <TableRow>
        <TableHead className="sticky left-0 bg-background z-10">Item</TableHead>
        <TableHead className="text-right">Qty</TableHead>
        <TableHead className="text-right">Unit Price</TableHead>
        <TableHead className="text-right">Tax %</TableHead>
        {buyers.map((b) => (
          <TableHead key={b.id} className="text-right">
            {b.label || `#${b.id}`}
          </TableHead>
        ))}
        <TableHead className="text-right font-semibold">Total</TableHead>
      </TableRow>
    </TableHeader>
  );
}
