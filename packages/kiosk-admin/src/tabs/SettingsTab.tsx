import type { KioskSettings } from "@kioskkit/shared";
import { Button, Input, Label } from "@kioskkit/ui";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useData } from "../hooks.js";
import { trpc } from "../trpc.js";

declare const __BUILD_DATE__: string;

export function SettingsTab() {
  const fetcher = useCallback(() => trpc["admin.settings.get"].query(), []);
  const { data: settings, error, loading, reload } = useData(fetcher);
  const [draft, setDraft] = useState<KioskSettings | null>(null);

  const versionFetcher = useCallback(() => trpc["admin.appUpdate.status"].query(), []);
  const { data: appStatus } = useData(versionFetcher);
  const version = appStatus?.currentVersion || "dev";

  useEffect(() => {
    if (settings) setDraft({ ...settings });
  }, [settings]);

  const set = <K extends keyof KioskSettings>(key: K, value: KioskSettings[K]) =>
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    trpc["admin.settings.update"]
      .mutate(draft)
      .then(() => {
        toast.success("Settings saved");
        reload();
      })
      .catch((err: Error) => toast.error(err.message));
  };

  if (loading) return <p className="text-muted-foreground">Loading...</p>;
  if (error) return <p className="text-destructive">Error: {error}</p>;
  if (!draft) return null;

  return (
    <form onSubmit={handleSubmit}>
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
      <p className="mt-3 text-xs text-muted-foreground">
        {version} · Built {__BUILD_DATE__}
      </p>
    </form>
  );
}
