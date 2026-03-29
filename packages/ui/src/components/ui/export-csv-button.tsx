import { Download } from "lucide-react";
import type { ComponentProps } from "react";
import { useCallback } from "react";
import { Button } from "./button";

interface ExportCsvButtonProps extends Omit<ComponentProps<typeof Button>, "onClick"> {
  getData: () => string[][];
  filename: string;
}

function escapeCsvCell(cell: string): string {
  if (cell.includes(",") || cell.includes('"') || cell.includes("\n") || cell.includes("\r")) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}

function buildCsv(rows: string[][]): string {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
}

function ExportCsvButton({ getData, filename, ...buttonProps }: ExportCsvButtonProps) {
  const handleClick = useCallback(() => {
    const rows = getData();
    const csv = buildCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [getData, filename]);

  return (
    <Button variant="outline" size="sm" onClick={handleClick} {...buttonProps}>
      <Download />
      Export CSV
    </Button>
  );
}

export type { ExportCsvButtonProps };
export { ExportCsvButton };
