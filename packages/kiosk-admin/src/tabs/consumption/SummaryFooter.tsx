import type { Buyer, BuyerTaxTotal, ConsumptionSummaryRow } from "@kioskkit/shared";
import { formatCurrency } from "@kioskkit/shared";
import { TableCell, TableFooter, TableRow } from "@kioskkit/ui";

interface SummaryFooterProps {
  summary: ConsumptionSummaryRow[];
  buyerTotals: BuyerTaxTotal[];
  buyerGrandTotals: Map<number, { total: number; count: number }>;
  buyers: Buyer[];
  locale: string;
  currency: string;
}

export function SummaryFooter({
  summary,
  buyerTotals,
  buyerGrandTotals,
  buyers,
  locale,
  currency,
}: SummaryFooterProps) {
  const grandTotal = summary.reduce((sum, r) => sum + r.grandTotal, 0);
  const grandCount = summary.reduce((sum, r) => sum + r.totalCount, 0);

  const taxRates = [...new Set(buyerTotals.map((bt) => bt.taxRate))].sort();

  const taxByRateAndBuyer = new Map<string, Map<number, number>>();
  const taxByRate = new Map<string, number>();
  for (const bt of buyerTotals) {
    if (!taxByRateAndBuyer.has(bt.taxRate)) {
      taxByRateAndBuyer.set(bt.taxRate, new Map());
    }
    taxByRateAndBuyer.get(bt.taxRate)!.set(bt.buyer, bt.netTotal);
    taxByRate.set(bt.taxRate, (taxByRate.get(bt.taxRate) ?? 0) + bt.netTotal);
  }

  return (
    <TableFooter>
      <TableRow className="font-semibold">
        <TableCell className="sticky left-0 bg-muted/50 z-10">Grand Total</TableCell>
        <TableCell />
        <TableCell />
        <TableCell />
        {buyers.map((b) => {
          const agg = buyerGrandTotals.get(b.id);
          return (
            <TableCell key={b.id} className="text-right">
              {agg ? `${formatCurrency(agg.total, locale, currency)} (${agg.count})` : ""}
            </TableCell>
          );
        })}
        <TableCell className="text-right">
          {formatCurrency(grandTotal, locale, currency)} ({grandCount})
        </TableCell>
      </TableRow>

      {taxRates.map((rate) => {
        const rateTotal = taxByRate.get(rate) ?? 0;
        const rateBuyers = taxByRateAndBuyer.get(rate);
        return (
          <TableRow key={rate} className="text-muted-foreground text-sm">
            <TableCell className="sticky left-0 bg-muted/50 z-10">
              {rate ? `Tax ${rate}%` : "Tax (unset)"}
            </TableCell>
            <TableCell />
            <TableCell />
            <TableCell />
            {buyers.map((b) => {
              const total = rateBuyers?.get(b.id);
              return (
                <TableCell key={b.id} className="text-right">
                  {total != null ? formatCurrency(total, locale, currency) : ""}
                </TableCell>
              );
            })}
            <TableCell className="text-right">
              {formatCurrency(rateTotal, locale, currency)}
            </TableCell>
          </TableRow>
        );
      })}
    </TableFooter>
  );
}
