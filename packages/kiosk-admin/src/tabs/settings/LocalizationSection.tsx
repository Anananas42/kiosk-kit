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
        <FieldDescription>Language code used by the kiosk (e.g. "cs", "en")</FieldDescription>
        <Input
          id={localeId}
          type="text"
          value={draft.locale}
          onChange={(e) => onChange("locale", e.target.value)}
          className="w-24"
        />
      </Field>

      <Field>
        <FieldLabel htmlFor={currencyId}>Currency</FieldLabel>
        <FieldDescription>Currency code for prices (e.g. "CZK", "EUR")</FieldDescription>
        <Input
          id={currencyId}
          type="text"
          value={draft.currency}
          onChange={(e) => onChange("currency", e.target.value)}
          className="w-24"
        />
      </Field>

      <Field>
        <FieldLabel htmlFor={buyerNounId}>Buyer noun</FieldLabel>
        <FieldDescription>Label used for buyers in the kiosk UI (e.g. "apartmán")</FieldDescription>
        <Input
          id={buyerNounId}
          type="text"
          value={draft.buyerNoun}
          onChange={(e) => onChange("buyerNoun", e.target.value)}
          className="max-w-[300px]"
        />
      </Field>
    </FieldSet>
  );
}
