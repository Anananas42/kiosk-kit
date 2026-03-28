import type { WifiNetwork } from "@kioskkit/shared";
import { Badge, Button, Spinner, TableCell, TableRow } from "@kioskkit/ui";
import type { FormEvent } from "react";
import { useState } from "react";
import { PasswordInput } from "./PasswordInput.js";
import { SignalIcon } from "./SignalIcon.js";
import { useConnectMutation } from "./useConnectMutation.js";

interface AvailableRowProps {
  network: WifiNetwork;
  expanded: boolean;
  onToggle: () => void;
}

export function AvailableRow({ network, expanded, onToggle }: AvailableRowProps) {
  const [password, setPassword] = useState("");

  const connectMutation = useConnectMutation(() => {
    onToggle();
    setPassword("");
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    connectMutation.mutate({
      ssid: network.ssid,
      password: network.security === "wpa" ? password : undefined,
    });
  };

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-secondary"
        onClick={() => {
          onToggle();
          setPassword("");
        }}
      >
        <TableCell className="w-8">
          <SignalIcon dBm={network.signal} />
        </TableCell>
        <TableCell className="font-medium">{network.ssid}</TableCell>
        <TableCell>{network.security === "wpa" && <Badge variant="outline">WPA</Badge>}</TableCell>
        <TableCell className="w-12" />
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={4}>
            <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2 py-1">
              {network.security === "wpa" && (
                <PasswordInput
                  value={password}
                  onChange={setPassword}
                  disabled={connectMutation.isPending}
                  ssid={network.ssid}
                />
              )}
              <Button type="submit" size="sm" disabled={connectMutation.isPending}>
                {connectMutation.isPending ? <Spinner className="mr-1" /> : null}
                Connect
              </Button>
            </form>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
