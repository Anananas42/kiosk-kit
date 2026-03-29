import type { WifiStatus } from "@kioskkit/shared";
import { Badge, TableCell, TableRow } from "@kioskkit/ui";
import { Lock } from "lucide-react";
import { ForgetButton } from "./ForgetButton.js";
import { SignalIcon } from "./SignalIcon.js";

interface ConnectedRowProps {
  current: NonNullable<WifiStatus["current"]>;
  forgettingSsid: string | null;
  onForget: (ssid: string) => void;
}

export function ConnectedRow({ current, forgettingSsid, onForget }: ConnectedRowProps) {
  return (
    <TableRow>
      <TableCell className="w-8">
        <SignalIcon dBm={current.signal} />
      </TableCell>
      <TableCell className="font-medium">
        <span className="inline-flex items-center gap-1.5">
          {current.ssid}
          {current.security === "wpa" && <Lock className="h-3 w-3 text-muted-foreground" />}
          <Badge className="bg-success text-white">Connected</Badge>
        </span>
      </TableCell>
      <TableCell />
      <TableCell className="w-12 text-right">
        <ForgetButton ssid={current.ssid} forgettingSsid={forgettingSsid} onForget={onForget} />
      </TableCell>
    </TableRow>
  );
}
