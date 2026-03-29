import type { PreorderConfig } from "@kioskkit/shared";
import { Button, Spinner } from "@kioskkit/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";
import { useDraftState } from "../../hooks/useDraftState.js";
import { queryKeys } from "../../lib/query.js";
import { trpc } from "../../trpc.js";
import { DayGrid } from "./DayGrid.js";

function getChangedWeekdays(
  draft: PreorderConfig,
  server: PreorderConfig,
): Array<{ weekday: number; ordering: boolean; delivery: boolean }> {
  const changes: Array<{ weekday: number; ordering: boolean; delivery: boolean }> = [];
  for (let i = 0; i < 7; i++) {
    if (
      draft.orderingDays[i] !== server.orderingDays[i] ||
      draft.deliveryDays[i] !== server.deliveryDays[i]
    ) {
      changes.push({
        weekday: i,
        ordering: draft.orderingDays[i],
        delivery: draft.deliveryDays[i],
      });
    }
  }
  return changes;
}

export function PreorderTab() {
  const queryClient = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: queryKeys.preorder.config(),
    queryFn: () => trpc["preorderConfig.get"].query(),
  });

  const { draft, setDraft, isDirty, cancel } = useDraftState(config);

  const toggleDay = useCallback(
    (field: "orderingDays" | "deliveryDays", weekday: number) => {
      setDraft((prev) => {
        if (!prev) return prev;
        const updated = {
          orderingDays: [...prev.orderingDays],
          deliveryDays: [...prev.deliveryDays],
        };
        updated[field][weekday] = !updated[field][weekday];
        return updated;
      });
    },
    [setDraft],
  );

  const saveMutation = useMutation({
    mutationFn: async (
      changes: Array<{ weekday: number; ordering: boolean; delivery: boolean }>,
    ) => {
      for (const change of changes) {
        await trpc["admin.preorderConfig.update"].mutate(change);
      }
    },
    onSuccess: () => {
      toast.success("Preorder config saved");
      queryClient.invalidateQueries({ queryKey: queryKeys.preorder.config() });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSave = () => {
    if (!draft || !config) return;
    const changes = getChangedWeekdays(draft, config);
    if (changes.length === 0) return;
    saveMutation.mutate(changes);
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted-foreground">
        <Spinner /> Loading preorder config...
      </div>
    );
  }

  if (!draft) return null;

  return (
    <div className="flex flex-col gap-4">
      <DayGrid
        draft={draft}
        serverState={config}
        onToggle={toggleDay}
        disabled={saveMutation.isPending}
      />

      <div className="flex items-center gap-2">
        <Button onClick={handleSave} disabled={!isDirty || saveMutation.isPending}>
          {saveMutation.isPending ? <Spinner className="mr-1" /> : null}
          Save Config
        </Button>
        {isDirty && (
          <Button variant="outline" onClick={cancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
