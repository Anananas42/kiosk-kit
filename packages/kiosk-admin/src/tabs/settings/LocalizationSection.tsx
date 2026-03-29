import type { KioskSettings } from "@kioskkit/shared";
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet, Input } from "@kioskkit/ui";
import { useId } from "react";

interface LocalizationSectionProps {
  draft: KioskSettings;
  onChange: <K extends keyof KioskSettings>(key: K, value: KioskSettings[K]) => void;
}

export function LocalizationSection({ draft, onChange }: LocalizationSectionProps) {
  const localeId = useId();
  const currencyId = useId();
  const buyerNounId = useId();

  return (
    <FieldSet>
      <FieldLegend>Localization</FieldLegend>

      <Field>
        <FieldLabel htmlFor={localeId}>Locale</FieldLabel>
        <FieldDescription>Language code for the kiosk interface (e.g. "cs", "en")</FieldDescription>
        <Input
          id={localeId}
          type="text"
          placeholder="cs"
          value={draft.locale}
          onChange={(e) => onChange("locale", e.target.value)}
          className="w-24"
        />
      </Field>

      <Field>
        <FieldLabel htmlFor={currencyId}>Currency</FieldLabel>
        <FieldDescription>Currency code shown on prices (e.g. "CZK", "EUR")</FieldDescription>
        <Input
          id={currencyId}
          type="text"
          placeholder="CZK"
          value={draft.currency}
          onChange={(e) => onChange("currency", e.target.value)}
          className="w-24"
        />
      </Field>

      <Field>
        <FieldLabel htmlFor={buyerNounId}>Buyer noun</FieldLabel>
        <FieldDescription>
          The label used instead of "buyer" in the kiosk UI (e.g. "apartmán", "room")
        </FieldDescription>
        <Input
          id={buyerNounId}
          type="text"
          placeholder="apartmán"
          value={draft.buyerNoun}
          onChange={(e) => onChange("buyerNoun", e.target.value)}
          className="w-48"
        />
      </Field>
    </FieldSet>
  );
}
