import type { WifiNetwork } from "@kioskkit/shared";
import type { FormEvent } from "react";
import { SignalIcon } from "./SignalIcon.js";
import type { NetworkActions } from "./types.js";

interface AvailableNetworkListProps {
  networks: WifiNetwork[];
  actions: NetworkActions;
}

export function AvailableNetworkList({ networks, actions }: AvailableNetworkListProps) {
  if (networks.length === 0) return null;

  return (
    <>
      <h3 className="section-heading">Available Networks</h3>
      {networks.map((net) => (
        <AvailableNetworkRow key={net.ssid} network={net} actions={actions} />
      ))}
    </>
  );
}

function AvailableNetworkRow({
  network,
  actions,
}: {
  network: WifiNetwork;
  actions: NetworkActions;
}) {
  const { expanded, toggleExpand, password, setPassword, connecting, handleConnect } = actions;
  const isExpanded = expanded?.ssid === network.ssid && expanded.type === "available";

  return (
    <div>
      <button
        type="button"
        className="network-row network-row-clickable"
        onClick={() => toggleExpand(network.ssid, "available")}
      >
        <div className="network-row-info">
          <SignalIcon dBm={network.signal} />
          <span className="network-ssid">{network.ssid}</span>
          {network.security === "wpa" && <span className="network-lock">WPA</span>}
        </div>
      </button>
      {isExpanded && (
        <form
          className="network-expand"
          onSubmit={(e: FormEvent) =>
            handleConnect(e, network.ssid, network.security === "wpa" ? password : undefined)
          }
        >
          <div className="form-row">
            {network.security === "wpa" && (
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={connecting}
              />
            )}
            <button type="submit" className="btn btn-primary btn-sm" disabled={connecting}>
              {connecting ? "Connecting..." : "Connect"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
