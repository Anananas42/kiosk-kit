import type { WifiNetwork } from "@kioskkit/shared";
import {
  Badge,
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

interface AvailableNetworkListProps {
  networks: WifiNetwork[];
}

export function AvailableNetworkList({ networks }: AvailableNetworkListProps) {
  if (networks.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Available Networks</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableBody>
            {networks.map((net) => (
              <AvailableNetworkRow key={net.ssid} network={net} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function AvailableNetworkRow({ network }: { network: WifiNetwork }) {
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
          setExpanded(!expanded);
          setPassword("");
        }}
      >
        <TableCell className="w-8">
          <SignalIcon dBm={network.signal} />
        </TableCell>
        <TableCell className="font-medium">{network.ssid}</TableCell>
        <TableCell>{network.security === "wpa" && <Badge variant="outline">WPA</Badge>}</TableCell>
        <TableCell />
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={4}>
            <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2 py-1">
              {network.security === "wpa" && (
                <Input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={connectMutation.isPending}
                  className="w-auto min-w-[200px]"
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
