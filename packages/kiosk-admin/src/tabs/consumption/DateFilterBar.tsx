import { Input, Label } from "@kioskkit/ui";
import { useId } from "react";

interface DateFilterBarProps {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}

export function DateFilterBar({ from, to, onFromChange, onToChange }: DateFilterBarProps) {
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
    </div>
  );
}
