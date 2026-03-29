import type { KioskSettings } from "@kioskkit/shared";
import { Button, Spinner } from "@kioskkit/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";
import { useDraftState } from "../../hooks/useDraftState.js";
import { queryKeys } from "../../lib/query.js";
import { trpc } from "../../trpc.js";
import { DisplaySection } from "./DisplaySection.js";
import { LocalizationSection } from "./LocalizationSection.js";
import { OperationsSection } from "./OperationsSection.js";

declare const __BUILD_DATE__: string;

export function SettingsTab() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: queryKeys.settings.get(),
    queryFn: () => trpc["admin.settings.get"].query(),
  });

  const { data: appStatus } = useQuery({
    queryKey: ["appUpdate", "status"],
    queryFn: () => trpc["admin.appUpdate.status"].query(),
  });

  const { draft, setDraft, isDirty, cancel } = useDraftState(settings);

  const updateField = useCallback(
    <K extends keyof KioskSettings>(key: K, value: KioskSettings[K]) => {
      setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
    },
    [setDraft],
  );

  const saveMutation = useMutation({
    mutationFn: (data: KioskSettings) => trpc["admin.settings.update"].mutate(data),
    onSuccess: () => {
      toast.success("Settings saved");
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.get() });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSave = () => {
    if (!draft) return;
    saveMutation.mutate(draft);
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted-foreground">
        <Spinner /> Loading settings...
      </div>
    );
  }

  if (!draft) return null;

  return (
    <div className="flex flex-col gap-6">
      <DisplaySection draft={draft} onChange={updateField} />
      <LocalizationSection draft={draft} onChange={updateField} />
      <OperationsSection draft={draft} onChange={updateField} />

      <div className="flex items-center gap-2">
        <Button onClick={handleSave} disabled={!isDirty || saveMutation.isPending}>
          {saveMutation.isPending ? <Spinner className="mr-1" /> : null}
          Save Settings
        </Button>
        {isDirty && (
          <Button variant="outline" onClick={cancel}>
            Cancel
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {appStatus?.currentVersion ? `${appStatus.currentVersion} · ` : ""}Built {__BUILD_DATE__}
      </p>
    </div>
  );
}
