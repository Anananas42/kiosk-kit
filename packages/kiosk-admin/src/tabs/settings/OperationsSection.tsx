import type { KioskSettings } from "@kioskkit/shared";
import { Label, Switch } from "@kioskkit/ui";
import { useId } from "react";

interface OperationsSectionProps {
  draft: KioskSettings;
  onChange: <K extends keyof KioskSettings>(key: K, value: KioskSettings[K]) => void;
}

export function OperationsSection({ draft, onChange }: OperationsSectionProps) {
  const maintenanceId = useId();

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold">Operations</legend>

      <div className="flex items-center gap-3">
        <Switch
          id={maintenanceId}
          checked={draft.maintenance}
          onCheckedChange={(checked) => onChange("maintenance", checked)}
        />
        <div>
          <Label htmlFor={maintenanceId}>Maintenance mode</Label>
          <p className="text-xs text-muted-foreground">
            Blocks all transactions and shows a maintenance screen
          </p>
        </div>
      </div>
    </fieldset>
  );
}
