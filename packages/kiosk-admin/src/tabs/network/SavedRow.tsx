import type { WifiStatus } from "@kioskkit/shared";
import { Button, Input, Spinner, TableCell, TableRow } from "@kioskkit/ui";
import type { FormEvent } from "react";
import { useState } from "react";
import { ForgetButton } from "./ForgetButton.js";
import { SignalIcon } from "./SignalIcon.js";
import { useConnectMutation } from "./useConnectMutation.js";

interface SavedRowProps {
  network: WifiStatus["saved"][number];
  forgettingSsid: string | null;
  onForget: (ssid: string) => void;
}

export function SavedRow({ network, forgettingSsid, onForget }: SavedRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [password, setPassword] = useState("");

  const connectMutation = useConnectMutation(() => {
    setExpanded(false);
    setPassword("");
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    connectMutation.mutate({ ssid: network.ssid, password: password || undefined });
  };

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-secondary"
        onClick={() => {
          setExpanded(!expanded);
          setPassword("");
        }}
      >
        <TableCell className="w-8">
          {network.inRange && network.signal != null ? (
            <SignalIcon dBm={network.signal} />
          ) : (
            <SignalIcon dBm={-100} />
          )}
        </TableCell>
        <TableCell className="font-medium">
          {network.ssid}
          {!(network.inRange && network.signal != null) && (
            <span className="ml-2 text-xs italic text-muted-foreground">out of range</span>
          )}
        </TableCell>
        <TableCell />
        <TableCell className="w-12 text-right">
          <ForgetButton ssid={network.ssid} forgettingSsid={forgettingSsid} onForget={onForget} />
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={4}>
            <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2 py-1">
              <Input
                type="password"
                placeholder="New password (optional)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={connectMutation.isPending}
                className="w-auto min-w-[200px]"
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
