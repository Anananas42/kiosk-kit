import type { KioskSettings } from "@kioskkit/shared";
import { Button, Input, Label } from "@kioskkit/ui";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useData, useFormStatus } from "../hooks.js";
import { trpc } from "../trpc.js";

export function SettingsTab() {
  const fetcher = useCallback(() => trpc["admin.settings.get"].query(), []);
  const { data: settings, error, loading, reload } = useData(fetcher);
  const form = useFormStatus();
  const [draft, setDraft] = useState<KioskSettings | null>(null);

  useEffect(() => {
    if (settings) setDraft({ ...settings });
  }, [settings]);

  const set = <K extends keyof KioskSettings>(key: K, value: KioskSettings[K]) =>
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    form.clear();
    trpc["admin.settings.update"]
      .mutate(draft)
      .then(() => {
        form.setSuccess("Settings saved");
        reload();
      })
      .catch((err: Error) => form.setError(err.message));
  };

  if (loading) return <p className="text-muted-foreground">Loading...</p>;
  if (error) return <p className="text-destructive">Error: {error}</p>;
  if (!draft) return null;

  return (
    <form onSubmit={handleSubmit}>
      {form.error && <p className="my-2 text-destructive">{form.error}</p>}
      {form.success && <p className="my-2 text-success">{form.success}</p>}

      <div className="mb-4">
        <Label className="mb-1 block text-xs text-muted-foreground">Idle Dim (ms)</Label>
        <Input
          type="number"
          value={draft.idleDimMs}
          onChange={(e) => set("idleDimMs", Number(e.target.value))}
          className="max-w-[300px]"
        />
      </div>
      <div className="mb-4">
        <Label className="mb-1 block text-xs text-muted-foreground">Inactivity Timeout (ms)</Label>
        <Input
          type="number"
          value={draft.inactivityTimeoutMs}
          onChange={(e) => set("inactivityTimeoutMs", Number(e.target.value))}
          className="max-w-[300px]"
        />
      </div>
      <div className="mb-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={draft.maintenance}
            onChange={(e) => set("maintenance", e.target.checked)}
          />{" "}
          Maintenance Mode
        </label>
      </div>
      <div className="mb-4">
        <Label className="mb-1 block text-xs text-muted-foreground">Locale</Label>
        <Input
          type="text"
          value={draft.locale}
          onChange={(e) => set("locale", e.target.value)}
          className="w-24"
        />
      </div>
      <div className="mb-4">
        <Label className="mb-1 block text-xs text-muted-foreground">Currency</Label>
        <Input
          type="text"
          value={draft.currency}
          onChange={(e) => set("currency", e.target.value)}
          className="w-24"
        />
      </div>
      <div className="mb-4">
        <Label className="mb-1 block text-xs text-muted-foreground">Buyer Noun</Label>
        <Input
          type="text"
          value={draft.buyerNoun}
          onChange={(e) => set("buyerNoun", e.target.value)}
          className="max-w-[300px]"
        />
      </div>
      <Button type="submit">Save Settings</Button>
    </form>
  );
}
