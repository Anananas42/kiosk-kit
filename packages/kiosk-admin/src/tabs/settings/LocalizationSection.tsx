import type { KioskSettings } from "@kioskkit/shared";
import { Input, Label } from "@kioskkit/ui";
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
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold">Localization</legend>

      <div className="grid grid-cols-[auto_auto_1fr] items-end gap-4">
        <div className="space-y-1">
          <Label htmlFor={localeId}>Locale</Label>
          <Input
            id={localeId}
            type="text"
            placeholder="cs"
            value={draft.locale}
            onChange={(e) => onChange("locale", e.target.value)}
            className="w-20"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor={currencyId}>Currency</Label>
          <Input
            id={currencyId}
            type="text"
            placeholder="CZK"
            value={draft.currency}
            onChange={(e) => onChange("currency", e.target.value)}
            className="w-20"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor={buyerNounId}>Buyer noun</Label>
          <p className="text-xs text-muted-foreground">Label for buyers in the kiosk UI</p>
          <Input
            id={buyerNounId}
            type="text"
            placeholder="apartmán"
            value={draft.buyerNoun}
            onChange={(e) => onChange("buyerNoun", e.target.value)}
            className="w-40"
          />
        </div>
      </div>
    </fieldset>
  );
}
