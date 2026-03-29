import type { Buyer, ConsumptionSummaryRow } from "@kioskkit/shared";
import { formatCurrency } from "@kioskkit/shared";
import { TableCell, TableRow } from "@kioskkit/ui";

interface SummaryItemRowProps {
  row: ConsumptionSummaryRow;
  buyers: Buyer[];
  locale: string;
  currency: string;
}

export function SummaryItemRow({ row, buyers, locale, currency }: SummaryItemRowProps) {
  const formattedUnitPrice =
    row.unitPrice != null ? formatCurrency(row.unitPrice, locale, currency) : "—";

  return (
    <TableRow>
      <TableCell className="sticky left-0 bg-background z-10">{row.item}</TableCell>
      <TableCell className="text-right text-muted-foreground">{row.quantity || "—"}</TableCell>
      <TableCell className="text-right">{formattedUnitPrice}</TableCell>
      <TableCell className="text-right text-muted-foreground">
        {row.taxRate ? `${row.taxRate}%` : "—"}
      </TableCell>
      {buyers.map((b) => {
        const agg = row.byBuyer[String(b.id)];
        return (
          <TableCell key={b.id} className="text-right">
            {agg ? `${formatCurrency(agg.total, locale, currency)} (${agg.count})` : ""}
          </TableCell>
        );
      })}
      <TableCell className="text-right font-semibold">
        {formatCurrency(row.grandTotal, locale, currency)} ({row.totalCount})
      </TableCell>
    </TableRow>
  );
}
