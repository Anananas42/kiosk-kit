import type { WifiStatus } from "@kioskkit/shared";
import { Button, Spinner, TableCell, TableRow } from "@kioskkit/ui";
import { Lock } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { ForgetButton } from "./ForgetButton.js";
import { PasswordInput } from "./PasswordInput.js";
import { SignalIcon } from "./SignalIcon.js";
import { useConnectMutation } from "./useConnectMutation.js";

interface SavedRowProps {
  network: WifiStatus["saved"][number];
  forgettingSsid: string | null;
  onForget: (ssid: string) => void;
  expanded: boolean;
  onToggle: () => void;
}

export function SavedRow({ network, forgettingSsid, onForget, expanded, onToggle }: SavedRowProps) {
  const [password, setPassword] = useState("");
  const isOutOfRange = !(network.inRange && network.signal != null);

  const connectMutation = useConnectMutation(() => {
    onToggle();
    setPassword("");
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    connectMutation.mutate({ ssid: network.ssid, password: password || undefined });
  };

  return (
    <>
      <TableRow
        className={isOutOfRange ? "opacity-50" : "cursor-pointer hover:bg-secondary"}
        onClick={
          isOutOfRange
            ? undefined
            : () => {
                onToggle();
                setPassword("");
              }
        }
      >
        <TableCell className="w-8">
          {isOutOfRange ? <SignalIcon dBm={-100} offline /> : <SignalIcon dBm={network.signal!} />}
        </TableCell>
        <TableCell className="font-medium">
          <span className="inline-flex items-center gap-1.5">
            {network.ssid}
            {network.security === "wpa" && <Lock className="h-3 w-3 text-muted-foreground" />}
            {isOutOfRange && (
              <span className="text-xs italic text-muted-foreground">out of range</span>
            )}
          </span>
        </TableCell>
        <TableCell />
        <TableCell className="w-12 text-right">
          <ForgetButton ssid={network.ssid} forgettingSsid={forgettingSsid} onForget={onForget} />
        </TableCell>
      </TableRow>
      {expanded && !isOutOfRange && (
        <TableRow>
          <TableCell colSpan={4}>
            <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2 py-1">
              <PasswordInput
                value={password}
                onChange={setPassword}
                disabled={connectMutation.isPending}
                placeholder="New password (optional)"
                ssid={network.ssid}
              />
              <Button type="submit" size="sm" disabled={connectMutation.isPending}>
                {connectMutation.isPending ? <Spinner className="mr-1" /> : null}
                Reconnect
              </Button>
            </form>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
