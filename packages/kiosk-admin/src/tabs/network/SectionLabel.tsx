import { TableCell, TableRow } from "@kioskkit/ui";

export function SectionLabel({ label }: { label: string }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell
        colSpan={4}
        className="pt-4 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide"
      >
        {label}
      </TableCell>
    </TableRow>
  );
}
