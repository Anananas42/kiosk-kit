import type { PreorderConfig } from "@kioskkit/shared";
import { useCallback, useEffect, useState } from "react";
import { useData, useFormStatus } from "../hooks.js";
import { trpc } from "../trpc.js";

// Array indices: 0=Sun, 1=Mon, ..., 6=Sat
// Display order: Mon-Sun
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// Map display index -> schema index (0=Sun): Mon=1, Tue=2, ..., Sat=6, Sun=0
const DISPLAY_TO_WEEKDAY = [1, 2, 3, 4, 5, 6, 0];

export function PreorderTab() {
  const fetcher = useCallback(() => trpc["preorderConfig.get"].query(), []);
  const { data: config, error, loading, reload } = useData(fetcher);
  const form = useFormStatus();
  const [draft, setDraft] = useState<PreorderConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (config) {
      setDraft({
        orderingDays: [...config.orderingDays],
        deliveryDays: [...config.deliveryDays],
      });
    }
  }, [config]);

  const toggle = (field: "orderingDays" | "deliveryDays", displayIdx: number) => {
    if (!draft || saving) return;
    const weekday = DISPLAY_TO_WEEKDAY[displayIdx];
    const newDraft: PreorderConfig = {
      orderingDays: [...draft.orderingDays],
      deliveryDays: [...draft.deliveryDays],
    };
    newDraft[field][weekday] = !newDraft[field][weekday];
    setDraft(newDraft);

    setSaving(true);
    form.clear();
    trpc["admin.preorderConfig.update"]
      .mutate({
        weekday,
        ordering: newDraft.orderingDays[weekday],
        delivery: newDraft.deliveryDays[weekday],
      })
      .then(() => {
        form.setSuccess("Updated");
        reload();
      })
      .catch((err: Error) => {
        form.setError(err.message);
        if (config) {
          setDraft({
            orderingDays: [...config.orderingDays],
            deliveryDays: [...config.deliveryDays],
          });
        }
      })
      .finally(() => setSaving(false));
  };

  if (loading) return <p className="msg-loading">Loading...</p>;
  if (error) return <p className="msg-error">Error: {error}</p>;
  if (!draft) return null;

  return (
    <div>
      {form.error && <p className="msg-error">{form.error}</p>}
      {form.success && <p className="msg-success">{form.success}</p>}

      <div className="preorder-grid">
        {/* Header row */}
        <div className="grid-header" />
        {DAY_LABELS.map((day) => (
          <div key={day} className="grid-header">
            {day}
          </div>
        ))}

        {/* Ordering row */}
        <div className="grid-label">Ordering</div>
        {DISPLAY_TO_WEEKDAY.map((weekday, displayIdx) => (
          <div key={`ordering-${weekday}`}>
            <input
              type="checkbox"
              checked={draft.orderingDays[weekday]}
              onChange={() => toggle("orderingDays", displayIdx)}
              disabled={saving}
            />
          </div>
        ))}

        {/* Delivery row */}
        <div className="grid-label">Delivery</div>
        {DISPLAY_TO_WEEKDAY.map((weekday, displayIdx) => (
          <div key={`delivery-${weekday}`}>
            <input
              type="checkbox"
              checked={draft.deliveryDays[weekday]}
              onChange={() => toggle("deliveryDays", displayIdx)}
              disabled={saving}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
