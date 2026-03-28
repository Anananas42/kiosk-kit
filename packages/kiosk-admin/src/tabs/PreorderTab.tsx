import type { PreorderConfig } from "@kioskkit/shared";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useData } from "../hooks.js";
import { trpc } from "../trpc.js";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DISPLAY_TO_WEEKDAY = [1, 2, 3, 4, 5, 6, 0];

export function PreorderTab() {
  const fetcher = useCallback(() => trpc["preorderConfig.get"].query(), []);
  const { data: config, error, loading, reload } = useData(fetcher);
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
    trpc["admin.preorderConfig.update"]
      .mutate({
        weekday,
        ordering: newDraft.orderingDays[weekday],
        delivery: newDraft.deliveryDays[weekday],
      })
      .then(() => {
        toast.success("Updated");
        reload();
      })
      .catch((err: Error) => {
        toast.error(err.message);
        if (config) {
          setDraft({
            orderingDays: [...config.orderingDays],
            deliveryDays: [...config.deliveryDays],
          });
        }
      })
      .finally(() => setSaving(false));
  };

  if (loading) return <p className="text-muted-foreground">Loading...</p>;
  if (error) return <p className="text-destructive">Error: {error}</p>;
  if (!draft) return null;

  return (
    <div>
      <div className="grid grid-cols-[auto_repeat(7,1fr)] gap-px overflow-hidden rounded-md border border-border">
        {/* Header row */}
        <div className="flex items-center justify-center bg-secondary p-2 text-xs font-semibold text-muted-foreground" />
        {DAY_LABELS.map((day) => (
          <div
            key={day}
            className="flex items-center justify-center bg-secondary p-2 text-xs font-semibold text-muted-foreground"
          >
            {day}
          </div>
        ))}

        {/* Ordering row */}
        <div className="flex items-center bg-secondary p-2 text-sm font-medium">Ordering</div>
        {DISPLAY_TO_WEEKDAY.map((weekday, displayIdx) => (
          <div
            key={`ordering-${weekday}`}
            className="flex items-center justify-center bg-background p-2"
          >
            <input
              type="checkbox"
              checked={draft.orderingDays[weekday]}
              onChange={() => toggle("orderingDays", displayIdx)}
              disabled={saving}
            />
          </div>
        ))}

        {/* Delivery row */}
        <div className="flex items-center bg-secondary p-2 text-sm font-medium">Delivery</div>
        {DISPLAY_TO_WEEKDAY.map((weekday, displayIdx) => (
          <div
            key={`delivery-${weekday}`}
            className="flex items-center justify-center bg-background p-2"
          >
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
