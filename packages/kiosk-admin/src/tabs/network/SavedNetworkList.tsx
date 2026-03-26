import type { WifiStatus } from "@kioskkit/shared";
import { Button, Input } from "@kioskkit/ui";
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
      <h3 className="mt-6 mb-4 text-sm font-semibold">Saved Networks</h3>
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
      <div className="flex items-center justify-between border-b border-border/50 px-2 py-2">
        <button
          type="button"
          className="flex flex-1 cursor-pointer items-center gap-2 border-none bg-transparent p-0 text-left hover:bg-secondary"
          onClick={() => toggleExpand(network.ssid, "saved")}
        >
          {network.inRange && network.signal != null ? (
            <SignalIcon dBm={network.signal} />
          ) : (
            <span className="text-xs italic text-muted-foreground">Out of range</span>
          )}
          <span className="font-medium">{network.ssid}</span>
        </button>
        <Button
          variant="destructive"
          size="sm"
          disabled={forgetting === network.ssid}
          onClick={() => actions.handleForget(network.ssid)}
        >
          {forgetting === network.ssid ? "Forgetting..." : "Forget"}
        </Button>
      </div>
      {isExpanded && (
        <form
          className="border-b border-border/50 bg-secondary p-2"
          onSubmit={(e: FormEvent) => handleConnect(e, network.ssid, password)}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="password"
              placeholder="New password (optional)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={connecting}
              className="w-auto min-w-[200px]"
            />
            <Button type="submit" size="sm" disabled={connecting}>
              {connecting ? "Connecting..." : "Reconnect"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
