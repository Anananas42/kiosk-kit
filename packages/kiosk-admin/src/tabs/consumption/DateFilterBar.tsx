import type { Buyer } from "@kioskkit/shared";
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@kioskkit/ui";
import { useId } from "react";

interface DateFilterBarProps {
  from: string;
  to: string;
  buyer: string;
  buyers: Buyer[];
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onBuyerChange: (value: string) => void;
}

export function DateFilterBar({
  from,
  to,
  buyer,
  buyers,
  onFromChange,
  onToChange,
  onBuyerChange,
}: DateFilterBarProps) {
  const fromId = useId();
  const toId = useId();

  return (
    <div className="flex items-end gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor={fromId}>From</Label>
        <Input
          id={fromId}
          type="date"
          value={from}
          onChange={(e) => onFromChange(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={toId}>To</Label>
        <Input id={toId} type="date" value={to} onChange={(e) => onToChange(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1">
        <Label>Buyer</Label>
        <Select value={buyer} onValueChange={onBuyerChange}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All buyers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All buyers</SelectItem>
            {buyers.map((b) => (
              <SelectItem key={b.id} value={String(b.id)}>
                {b.label || `#${b.id}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
