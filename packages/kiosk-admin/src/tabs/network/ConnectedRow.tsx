import type { WifiStatus } from "@kioskkit/shared";
import { Badge, TableCell, TableRow } from "@kioskkit/ui";
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
      <TableCell className="font-medium">{current.ssid}</TableCell>
      <TableCell>
        <Badge className="bg-success text-white">Connected</Badge>
      </TableCell>
      <TableCell className="w-12 text-right">
        <ForgetButton ssid={current.ssid} forgettingSsid={forgettingSsid} onForget={onForget} />
      </TableCell>
    </TableRow>
  );
}
