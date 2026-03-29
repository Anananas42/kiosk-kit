import type { KioskSettings } from "@kioskkit/shared";
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet, Input } from "@kioskkit/ui";
import { useId } from "react";

interface DisplaySectionProps {
  draft: KioskSettings;
  onChange: <K extends keyof KioskSettings>(key: K, value: KioskSettings[K]) => void;
}

export function DisplaySection({ draft, onChange }: DisplaySectionProps) {
  const idleDimId = useId();
  const inactivityId = useId();

  return (
    <FieldSet>
      <FieldLegend>Display</FieldLegend>

      <Field>
        <FieldLabel htmlFor={idleDimId}>Idle dim timeout</FieldLabel>
        <FieldDescription>Time in milliseconds before the screen dims when idle</FieldDescription>
        <Input
          id={idleDimId}
          type="number"
          min={0}
          value={draft.idleDimMs}
          onChange={(e) => onChange("idleDimMs", Number(e.target.value))}
          className="max-w-[300px]"
        />
      </Field>

      <Field>
        <FieldLabel htmlFor={inactivityId}>Inactivity timeout</FieldLabel>
        <FieldDescription>
          Time in milliseconds before the session resets due to inactivity
        </FieldDescription>
        <Input
          id={inactivityId}
          type="number"
          min={0}
          value={draft.inactivityTimeoutMs}
          onChange={(e) => onChange("inactivityTimeoutMs", Number(e.target.value))}
          className="max-w-[300px]"
        />
      </Field>
    </FieldSet>
  );
}
