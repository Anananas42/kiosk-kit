import { Button } from "@kioskkit/ui";
import { useCallback, useState } from "react";
import { useData, useFormStatus } from "../../hooks.js";
import { trpc } from "../../trpc.js";
import { AvailableNetworkList } from "./AvailableNetworkList.js";
import { ConnectedNetwork } from "./ConnectedNetwork.js";
import { ForgetWarningDialog } from "./ForgetWarningDialog.js";
import { HiddenNetworkForm } from "./HiddenNetworkForm.js";
import { SavedNetworkList } from "./SavedNetworkList.js";
import { useNetworkActions } from "./useNetworkActions.js";

export function NetworkTab() {
  const fetcher = useCallback(() => trpc["admin.network.list"].query(), []);
  const { data: status, error, loading, reload } = useData(fetcher);
  const form = useFormStatus();
  const [toggling, setToggling] = useState(false);

  const actions = useNetworkActions({
    status,
    reload,
    onError: form.setError,
    onClearError: form.clear,
  });

  const handleToggleWifi = () => {
    if (!status) return;
    setToggling(true);
    form.clear();
    const action = status.enabled
      ? trpc["admin.network.disable"].mutate()
      : trpc["admin.network.enable"].mutate();
    action
      .then(() => reload())
      .catch((err: Error) => form.setError(err.message))
      .finally(() => setToggling(false));
  };

  if (loading) return <p className="text-muted-foreground">Loading...</p>;
  if (error) return <p className="text-destructive">Error: {error}</p>;
  if (!status) return null;

  const savedNotConnected = status.saved.filter((s) => s.ssid !== status.current?.ssid);
  const savedSsids = new Set(status.saved.map((s) => s.ssid));
  const availableUnsaved = status.available
    .filter((n) => n.ssid !== status.current?.ssid && !savedSsids.has(n.ssid))
    .sort((a, b) => b.signal - a.signal);

  return (
    <div>
      <div className="mb-4 flex items-center gap-4">
        <h2 className="text-sm font-semibold">Network</h2>
        <Button variant="outline" size="sm" onClick={handleToggleWifi} disabled={toggling}>
          {toggling ? "..." : status.enabled ? "Disable WiFi" : "Enable WiFi"}
        </Button>
        {status.enabled && (
          <Button variant="outline" size="sm" onClick={reload}>
            Scan
          </Button>
        )}
      </div>

      {form.error && <p className="my-2 text-destructive">{form.error}</p>}

      {!status.enabled && <p className="italic text-muted-foreground">WiFi is disabled.</p>}

      {status.enabled && (
        <>
          {status.ethernet && (
            <span className="mb-4 inline-block rounded-md bg-success px-2 py-0.5 text-xs text-white">
              Ethernet connected
            </span>
          )}

          {status.current && (
            <ConnectedNetwork
              current={status.current}
              forgetting={actions.forgetting}
              onForget={actions.handleForget}
            />
          )}

          <SavedNetworkList networks={savedNotConnected} actions={actions} />
          <AvailableNetworkList networks={availableUnsaved} actions={actions} />

          {!status.current && savedNotConnected.length === 0 && availableUnsaved.length === 0 && (
            <p className="italic text-muted-foreground">No networks found. Click Scan to search.</p>
          )}

          <HiddenNetworkForm
            onConnected={reload}
            onError={form.setError}
            onClearError={form.clear}
          />

          {actions.showForgetWarning && (
            <ForgetWarningDialog
              ssid={actions.showForgetWarning}
              onConfirm={actions.doForget}
              onCancel={actions.dismissForgetWarning}
            />
          )}
        </>
      )}
    </div>
  );
}
