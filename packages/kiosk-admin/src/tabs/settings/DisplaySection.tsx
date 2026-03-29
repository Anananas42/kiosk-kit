import type { KioskSettings } from "@kioskkit/shared";
import { Input, Label } from "@kioskkit/ui";
import { useId } from "react";

interface DisplaySectionProps {
  draft: KioskSettings;
  onChange: <K extends keyof KioskSettings>(key: K, value: KioskSettings[K]) => void;
}

function msToSeconds(ms: number): string {
  return String(Math.round(ms / 1000));
}

function secondsToMs(seconds: string): number {
  const n = Number(seconds);
  return Number.isNaN(n) ? 0 : Math.round(n * 1000);
}

export function DisplaySection({ draft, onChange }: DisplaySectionProps) {
  const idleDimId = useId();
  const inactivityId = useId();

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold">Display</legend>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor={idleDimId}>Idle dim timeout</Label>
          <div className="flex items-center gap-2">
            <Input
              id={idleDimId}
              type="number"
              min={0}
              step={1}
              value={msToSeconds(draft.idleDimMs)}
              onChange={(e) => onChange("idleDimMs", secondsToMs(e.target.value))}
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">seconds</span>
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor={inactivityId}>Inactivity timeout</Label>
          <div className="flex items-center gap-2">
            <Input
              id={inactivityId}
              type="number"
              min={0}
              step={1}
              value={msToSeconds(draft.inactivityTimeoutMs)}
              onChange={(e) => onChange("inactivityTimeoutMs", secondsToMs(e.target.value))}
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">seconds</span>
          </div>
        </div>
      </div>
    </fieldset>
  );
}
