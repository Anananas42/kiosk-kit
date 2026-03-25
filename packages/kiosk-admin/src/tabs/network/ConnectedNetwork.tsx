import type { WifiStatus } from "@kioskkit/shared";
import { SignalIcon } from "./SignalIcon.js";

interface ConnectedNetworkProps {
  current: NonNullable<WifiStatus["current"]>;
  forgetting: string | null;
  onForget: (ssid: string) => void;
}

export function ConnectedNetwork({ current, forgetting, onForget }: ConnectedNetworkProps) {
  return (
    <>
      <h3 className="section-heading">Connected</h3>
      <div className="network-row">
        <div className="network-row-info">
          <SignalIcon dBm={current.signal} />
          <span className="network-ssid">{current.ssid}</span>
          <span className="badge" style={{ background: "var(--color-success)" }}>
            Connected
          </span>
        </div>
        <button
          type="button"
          className="btn btn-danger btn-sm"
          disabled={forgetting === current.ssid}
          onClick={() => onForget(current.ssid)}
        >
          {forgetting === current.ssid ? "Forgetting..." : "Forget"}
        </button>
      </div>
    </>
  );
}
