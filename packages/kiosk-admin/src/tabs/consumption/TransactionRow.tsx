import type { Buyer, RecordRow } from "@kioskkit/shared";
import { formatCurrency, parsePrice } from "@kioskkit/shared";
import { TableCell, TableRow } from "@kioskkit/ui";

interface TransactionRowProps {
  record: RecordRow;
  buyerMap: Map<number, Buyer>;
  locale: string;
  currency: string;
}

export function TransactionRow({ record, buyerMap, locale, currency }: TransactionRowProps) {
  const isNegative = record.count < 0;
  const buyer = buyerMap.get(record.buyer);
  const price = parsePrice(record.price) * record.count;

  return (
    <TableRow>
      <TableCell className="text-muted-foreground whitespace-nowrap">
        {formatTimestamp(record.timestamp, locale)}
      </TableCell>
      <TableCell>{buyer?.label ?? `#${record.buyer}`}</TableCell>
      <TableCell className={isNegative ? "text-destructive" : "text-green-600"}>
        {isNegative ? record.count : `+${record.count}`}
      </TableCell>
      <TableCell className="text-muted-foreground">{record.category}</TableCell>
      <TableCell>{record.item}</TableCell>
      <TableCell className="text-muted-foreground">{record.quantity || "—"}</TableCell>
      <TableCell className={`text-right ${isNegative ? "text-destructive" : ""}`}>
        {formatCurrency(price, locale, currency)}
      </TableCell>
    </TableRow>
  );
}

function formatTimestamp(iso: string, locale: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
