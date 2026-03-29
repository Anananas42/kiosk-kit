import type { WifiStatus } from "@kioskkit/shared";
import { Badge, TableCell, TableRow } from "@kioskkit/ui";
import { Lock } from "lucide-react";
import { ForgetButton } from "./ForgetButton.js";
import { SignalIcon } from "./SignalIcon.js";

interface ConnectedRowProps {
  current: NonNullable<WifiStatus["current"]>;
  forgettingSsid: string | null;
  onForget: (ssid: string) => void;
  expanded: boolean;
  onToggle: () => void;
}

export function ConnectedRow({
  current,
  forgettingSsid,
  onForget,
  expanded,
  onToggle,
}: ConnectedRowProps) {
  return (
    <>
      <TableRow className="cursor-pointer hover:bg-secondary" onClick={onToggle}>
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
        <TableCell className="w-12" />
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={4}>
            <div className="flex justify-end py-1">
              <ForgetButton
                ssid={current.ssid}
                forgettingSsid={forgettingSsid}
                onForget={onForget}
              />
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
