import type { WifiStatus } from "@kioskkit/shared";
import { Badge, Button } from "@kioskkit/ui";
import { SignalIcon } from "./SignalIcon.js";

interface ConnectedNetworkProps {
  current: NonNullable<WifiStatus["current"]>;
  forgetting: string | null;
  onForget: (ssid: string) => void;
}

export function ConnectedNetwork({ current, forgetting, onForget }: ConnectedNetworkProps) {
  return (
    <>
      <h3 className="mt-6 mb-4 text-sm font-semibold">Connected</h3>
      <div className="flex items-center justify-between border-b border-border/50 px-2 py-2">
        <div className="flex items-center gap-2">
          <SignalIcon dBm={current.signal} />
          <span className="font-medium">{current.ssid}</span>
          <Badge className="bg-success text-white">Connected</Badge>
        </div>
        <Button
          variant="destructive"
          size="sm"
          disabled={forgetting === current.ssid}
          onClick={() => onForget(current.ssid)}
        >
          {forgetting === current.ssid ? "Forgetting..." : "Forget"}
        </Button>
      </div>
    </>
  );
}
