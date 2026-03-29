import type { KioskSettings } from "@kioskkit/shared";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
  Switch,
} from "@kioskkit/ui";
import { useId } from "react";

interface OperationsSectionProps {
  draft: KioskSettings;
  onChange: <K extends keyof KioskSettings>(key: K, value: KioskSettings[K]) => void;
}

export function OperationsSection({ draft, onChange }: OperationsSectionProps) {
  const maintenanceId = useId();

  return (
    <FieldSet>
      <FieldLegend>Operations</FieldLegend>

      <Field orientation="horizontal">
        <Switch
          id={maintenanceId}
          checked={draft.maintenance}
          onCheckedChange={(checked) => onChange("maintenance", checked)}
        />
        <FieldContent>
          <FieldLabel htmlFor={maintenanceId}>Maintenance mode</FieldLabel>
          <FieldDescription>
            Displays a maintenance screen and blocks all transactions
          </FieldDescription>
        </FieldContent>
      </Field>
    </FieldSet>
  );
}
