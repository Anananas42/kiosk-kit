import type { KioskSettings } from "@kioskkit/shared";
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

  if (loading) return <p className="msg-loading">Loading...</p>;
  if (error) return <p className="msg-error">Error: {error}</p>;
  if (!draft) return null;

  return (
    <form onSubmit={handleSubmit}>
      {form.error && <p className="msg-error">{form.error}</p>}
      {form.success && <p className="msg-success">{form.success}</p>}

      <div className="form-field">
        <label>Idle Dim (ms)</label>
        <input
          type="number"
          value={draft.idleDimMs}
          onChange={(e) => set("idleDimMs", Number(e.target.value))}
        />
      </div>
      <div className="form-field">
        <label>Inactivity Timeout (ms)</label>
        <input
          type="number"
          value={draft.inactivityTimeoutMs}
          onChange={(e) => set("inactivityTimeoutMs", Number(e.target.value))}
        />
      </div>
      <div className="form-field">
        <label>
          <input
            type="checkbox"
            checked={draft.maintenance}
            onChange={(e) => set("maintenance", e.target.checked)}
          />{" "}
          Maintenance Mode
        </label>
      </div>
      <div className="form-field">
        <label>Locale</label>
        <input
          type="text"
          value={draft.locale}
          onChange={(e) => set("locale", e.target.value)}
          style={{ width: "6rem" }}
        />
      </div>
      <div className="form-field">
        <label>Currency</label>
        <input
          type="text"
          value={draft.currency}
          onChange={(e) => set("currency", e.target.value)}
          style={{ width: "6rem" }}
        />
      </div>
      <div className="form-field">
        <label>Buyer Noun</label>
        <input
          type="text"
          value={draft.buyerNoun}
          onChange={(e) => set("buyerNoun", e.target.value)}
        />
      </div>
      <button type="submit" className="btn btn-primary">
        Save Settings
      </button>
    </form>
  );
}
