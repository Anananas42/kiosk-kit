import type { Buyer, ConsumptionSummaryRow } from "@kioskkit/shared";
import { Spinner, Table, TableBody } from "@kioskkit/ui";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { queryKeys } from "../../lib/query.js";
import { trpc } from "../../trpc.js";
import { SummaryFooter } from "./SummaryFooter.js";
import { SummaryHeaderRow } from "./SummaryHeaderRow.js";
import { SummaryItemRow } from "./SummaryItemRow.js";

interface SummaryTableProps {
  from: string;
  to: string;
  selectedBuyer: number | undefined;
  buyers: Buyer[];
  locale: string;
  currency: string;
}

export function SummaryTable({
  from,
  to,
  selectedBuyer,
  buyers,
  locale,
  currency,
}: SummaryTableProps) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.consumption.summary(from, to || undefined),
    queryFn: () => trpc["reports.consumption"].query({ from, to: to || undefined }),
  });

  const { summary, buyerTotals, activeBuyers } = useMemo(() => {
    const rawSummary = data?.summary ?? [];
    const rawBuyerTotals = data?.buyerTotals ?? [];

    const filtered = selectedBuyer != null ? filterByBuyer(rawSummary, selectedBuyer) : rawSummary;

    const filteredBuyerTotals =
      selectedBuyer != null
        ? rawBuyerTotals.filter((bt) => bt.buyer === selectedBuyer)
        : rawBuyerTotals;

    const activeBuyerIds = new Set<number>();
    for (const row of filtered) {
      for (const buyerId of Object.keys(row.byBuyer)) {
        activeBuyerIds.add(Number(buyerId));
      }
    }
    const active = buyers.filter((b) => activeBuyerIds.has(b.id));

    return { summary: filtered, buyerTotals: filteredBuyerTotals, activeBuyers: active };
  }, [data, selectedBuyer, buyers]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted-foreground">
        <Spinner /> Loading summary...
      </div>
    );
  }

  if (summary.length === 0) {
    return (
      <p className="py-4 italic text-muted-foreground">No consumption data for this period.</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <SummaryHeaderRow buyers={activeBuyers} />
        <TableBody>
          {summary.map((row) => (
            <SummaryItemRow
              key={row.itemKey}
              row={row}
              buyers={activeBuyers}
              locale={locale}
              currency={currency}
            />
          ))}
        </TableBody>
        <SummaryFooter
          summary={summary}
          buyerTotals={buyerTotals}
          buyers={activeBuyers}
          locale={locale}
          currency={currency}
        />
      </Table>
    </div>
  );
}

function filterByBuyer(rows: ConsumptionSummaryRow[], buyerId: number): ConsumptionSummaryRow[] {
  const key = String(buyerId);
  return rows
    .filter((row) => row.byBuyer[key])
    .map((row) => {
      const agg = row.byBuyer[key];
      return {
        ...row,
        byBuyer: { [key]: agg },
        totalCount: agg.count,
        grandTotal: agg.total,
        unitPrice: agg.count !== 0 ? agg.total / agg.count : null,
      };
    });
}
