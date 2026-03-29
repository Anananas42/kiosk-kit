import type { Buyer } from "@kioskkit/shared";
import { Spinner, Table, TableBody } from "@kioskkit/ui";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query.js";
import { trpc } from "../../trpc.js";
import { SummaryFooter } from "./SummaryFooter.js";
import { SummaryHeaderRow } from "./SummaryHeaderRow.js";
import { SummaryItemRow } from "./SummaryItemRow.js";

interface SummaryTableProps {
  from: string;
  to: string;
  buyers: Buyer[];
  locale: string;
  currency: string;
}

export function SummaryTable({ from, to, buyers, locale, currency }: SummaryTableProps) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.consumption.summary(from, to || undefined),
    queryFn: () => trpc["reports.consumptionV2"].query({ from, to: to || undefined }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted-foreground">
        <Spinner /> Loading summary...
      </div>
    );
  }

  const summary = data?.summary ?? [];
  const buyerTotals = data?.buyerTotals ?? [];

  if (summary.length === 0) {
    return (
      <p className="py-4 italic text-muted-foreground">No consumption data for this period.</p>
    );
  }

  const activeBuyerIds = new Set<number>();
  for (const row of summary) {
    for (const buyerId of Object.keys(row.byBuyer)) {
      activeBuyerIds.add(Number(buyerId));
    }
  }
  const activeBuyers = buyers.filter((b) => activeBuyerIds.has(b.id));

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
