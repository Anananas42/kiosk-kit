import type { WifiStatus } from "@kioskkit/shared";
import type { FormEvent } from "react";
import { SignalIcon } from "./SignalIcon.js";
import type { NetworkActions } from "./types.js";

type SavedNetwork = WifiStatus["saved"][number];

interface SavedNetworkListProps {
  networks: SavedNetwork[];
  actions: NetworkActions;
}

export function SavedNetworkList({ networks, actions }: SavedNetworkListProps) {
  if (networks.length === 0) return null;

  return (
    <>
      <h3 className="section-heading">Saved Networks</h3>
      {networks.map((net) => (
        <SavedNetworkRow key={net.ssid} network={net} actions={actions} />
      ))}
    </>
  );
}

function SavedNetworkRow({ network, actions }: { network: SavedNetwork; actions: NetworkActions }) {
  const { expanded, toggleExpand, password, setPassword, connecting, forgetting, handleConnect } =
    actions;
  const isExpanded = expanded?.ssid === network.ssid && expanded.type === "saved";

  return (
    <div>
      <div className="network-row">
        <button
          type="button"
          className="network-row-clickable network-row-info"
          onClick={() => toggleExpand(network.ssid, "saved")}
        >
          {network.inRange && network.signal != null ? (
            <SignalIcon dBm={network.signal} />
          ) : (
            <span className="network-out-of-range">Out of range</span>
          )}
          <span className="network-ssid">{network.ssid}</span>
        </button>
        <button
          type="button"
          className="btn btn-danger btn-sm"
          disabled={forgetting === network.ssid}
          onClick={() => actions.handleForget(network.ssid)}
        >
          {forgetting === network.ssid ? "Forgetting..." : "Forget"}
        </button>
      </div>
      {isExpanded && (
        <form
          className="network-expand"
          onSubmit={(e: FormEvent) => handleConnect(e, network.ssid, password)}
        >
          <div className="form-row">
            <input
              type="password"
              placeholder="New password (optional)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={connecting}
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={connecting}>
              {connecting ? "Connecting..." : "Reconnect"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
