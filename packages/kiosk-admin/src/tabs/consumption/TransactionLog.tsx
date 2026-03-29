import type { Buyer } from "@kioskkit/shared";
import { Spinner, Table, TableBody, TableHead, TableHeader, TableRow } from "@kioskkit/ui";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { queryKeys } from "../../lib/query.js";
import { trpc } from "../../trpc.js";
import { TransactionRow } from "./TransactionRow.js";

interface TransactionLogProps {
  from: string;
  to: string;
  selectedBuyer: number | undefined;
  buyers: Buyer[];
  locale: string;
  currency: string;
}

export function TransactionLog({
  from,
  to,
  selectedBuyer,
  buyers,
  locale,
  currency,
}: TransactionLogProps) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.consumption.logs(from, to || undefined, selectedBuyer),
    queryFn: () =>
      trpc["records.list"].query({
        from,
        to: to || undefined,
        buyer: selectedBuyer,
      }),
  });

  const buyerMap = useMemo(() => new Map(buyers.map((b) => [b.id, b])), [buyers]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted-foreground">
        <Spinner /> Loading records...
      </div>
    );
  }

  const records = data?.records ?? [];

  if (records.length === 0) {
    return <p className="py-4 italic text-muted-foreground">No transactions for this period.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Timestamp</TableHead>
            <TableHead>Buyer</TableHead>
            <TableHead>+/−</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Item</TableHead>
            <TableHead>Qty</TableHead>
            <TableHead className="text-right">Price</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((record) => (
            <TransactionRow
              key={`${record.timestamp}-${record.buyer}-${record.item}-${record.count}`}
              record={record}
              buyerMap={buyerMap}
              locale={locale}
              currency={currency}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
