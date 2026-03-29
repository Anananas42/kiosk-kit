import type { Buyer } from "@kioskkit/shared";
import { parsePrice } from "@kioskkit/shared";
import {
  ExportCsvButton,
  Spinner,
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@kioskkit/ui";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
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

  const records = data?.records ?? [];

  const getCsvData = useCallback((): string[][] => {
    const headers = ["Timestamp", "Buyer", "+/-", "Category", "Item", "Qty", "Price"];
    const rows: string[][] = [headers];
    for (const record of records) {
      const buyer = buyerMap.get(record.buyer);
      const price = parsePrice(record.price) * record.count;
      rows.push([
        record.timestamp,
        buyer?.label ?? `#${record.buyer}`,
        record.count < 0 ? String(record.count) : `+${record.count}`,
        record.category,
        record.item,
        record.quantity ?? "",
        String(price),
      ]);
    }
    return rows;
  }, [records, buyerMap]);

  const csvFilename = `consumption-logs_${from}_${to || new Date().toISOString().slice(0, 10)}.csv`;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted-foreground">
        <Spinner /> Loading records...
      </div>
    );
  }

  if (records.length === 0) {
    return <p className="py-4 italic text-muted-foreground">No transactions for this period.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <div className="mb-2 flex justify-end">
        <ExportCsvButton getData={getCsvData} filename={csvFilename} />
      </div>
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
