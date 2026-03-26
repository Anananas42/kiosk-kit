import type { WifiNetwork } from "@kioskkit/shared";
import { Button, Input } from "@kioskkit/ui";
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
      <h3 className="mt-6 mb-4 text-sm font-semibold">Available Networks</h3>
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
        className="flex w-full cursor-pointer items-center justify-between border-b border-border/50 bg-transparent px-2 py-2 text-left hover:bg-secondary"
        onClick={() => toggleExpand(network.ssid, "available")}
      >
        <div className="flex items-center gap-2">
          <SignalIcon dBm={network.signal} />
          <span className="font-medium">{network.ssid}</span>
          {network.security === "wpa" && <span className="text-xs text-muted-foreground">WPA</span>}
        </div>
      </button>
      {isExpanded && (
        <form
          className="border-b border-border/50 bg-secondary p-2"
          onSubmit={(e: FormEvent) =>
            handleConnect(e, network.ssid, network.security === "wpa" ? password : undefined)
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            {network.security === "wpa" && (
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={connecting}
                className="w-auto min-w-[200px]"
              />
            )}
            <Button type="submit" size="sm" disabled={connecting}>
              {connecting ? "Connecting..." : "Connect"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
