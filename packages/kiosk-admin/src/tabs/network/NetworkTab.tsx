import { useCallback } from "react";
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

  const actions = useNetworkActions({
    status,
    reload,
    onError: form.setError,
    onClearError: form.clear,
  });

  if (loading) return <p className="msg-loading">Loading...</p>;
  if (error) return <p className="msg-error">Error: {error}</p>;
  if (!status) return null;

  const savedNotConnected = status.saved.filter((s) => s.ssid !== status.current?.ssid);
  const savedSsids = new Set(status.saved.map((s) => s.ssid));
  const availableUnsaved = status.available
    .filter((n) => n.ssid !== status.current?.ssid && !savedSsids.has(n.ssid))
    .sort((a, b) => b.signal - a.signal);

  return (
    <div>
      <div className="network-header">
        <h2 className="section-heading" style={{ margin: 0 }}>
          Network
        </h2>
        <button type="button" className="btn btn-sm" onClick={reload}>
          Scan
        </button>
      </div>

      {form.error && <p className="msg-error">{form.error}</p>}
      {status.ethernet && <p className="network-ethernet-badge">Ethernet connected</p>}

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
        <p className="empty-state">No networks found. Click Scan to search.</p>
      )}

      <HiddenNetworkForm onConnected={reload} onError={form.setError} onClearError={form.clear} />

      {actions.showForgetWarning && (
        <ForgetWarningDialog
          ssid={actions.showForgetWarning}
          onConfirm={actions.doForget}
          onCancel={actions.dismissForgetWarning}
        />
      )}
    </div>
  );
}
