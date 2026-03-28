import type { WifiStatus } from "@kioskkit/shared";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@kioskkit/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { queryKeys } from "../../lib/query.js";
import { trpc } from "../../trpc.js";
import { SignalIcon } from "./SignalIcon.js";

type SavedNetwork = WifiStatus["saved"][number];

interface SavedNetworkListProps {
  networks: SavedNetwork[];
  onForget: (ssid: string) => void;
  forgettingSsid: string | null;
}

export function SavedNetworkList({ networks, onForget, forgettingSsid }: SavedNetworkListProps) {
  if (networks.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Saved Networks</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableBody>
            {networks.map((net) => (
              <SavedNetworkRow
                key={net.ssid}
                network={net}
                onForget={onForget}
                forgettingSsid={forgettingSsid}
              />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function SavedNetworkRow({
  network,
  onForget,
  forgettingSsid,
}: {
  network: SavedNetwork;
  onForget: (ssid: string) => void;
  forgettingSsid: string | null;
}) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [password, setPassword] = useState("");

  const connectMutation = useMutation({
    mutationFn: (input: { ssid: string; password?: string }) =>
      trpc["admin.network.connect"].mutate(input),
    onSuccess: () => {
      toast.success("Connected");
      setExpanded(false);
      setPassword("");
      queryClient.invalidateQueries({ queryKey: queryKeys.network.status() });
    },
    onError: () => toast.error("Could not connect — check password and try again"),
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
            <span className="text-xs italic text-muted-foreground">Out of range</span>
          )}
        </TableCell>
        <TableCell className="font-medium">{network.ssid}</TableCell>
        <TableCell className="text-right">
          <Button
            variant="destructive"
            size="sm"
            disabled={forgettingSsid === network.ssid}
            onClick={(e) => {
              e.stopPropagation();
              onForget(network.ssid);
            }}
          >
            {forgettingSsid === network.ssid ? "Forgetting..." : "Forget"}
          </Button>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={3}>
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
