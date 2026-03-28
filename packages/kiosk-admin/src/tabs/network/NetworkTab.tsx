import type { WifiNetwork, WifiStatus } from "@kioskkit/shared";
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "../../components/ConfirmDialog.js";
import { queryKeys } from "../../lib/query.js";
import { trpc } from "../../trpc.js";
import { SignalIcon } from "./SignalIcon.js";

function useInvalidateNetwork() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.network.status() });
}

function needsForgetWarning(status: WifiStatus, ssid: string): boolean {
  return (
    status.current?.ssid === ssid &&
    !status.ethernet &&
    !status.saved.some((s) => s.ssid !== ssid && s.inRange)
  );
}

export function NetworkTab() {
  const invalidateNetwork = useInvalidateNetwork();
  const [forgetWarningSsid, setForgetWarningSsid] = useState<string | null>(null);

  const { data: status, isLoading } = useQuery({
    queryKey: queryKeys.network.status(),
    queryFn: () => trpc["admin.network.list"].query(),
  });

  const toggleWifiMutation = useMutation({
    mutationFn: () =>
      status?.enabled
        ? trpc["admin.network.disable"].mutate()
        : trpc["admin.network.enable"].mutate(),
    onSuccess: () => invalidateNetwork(),
    onError: (err: Error) => toast.error(err.message),
  });

  const forgetMutation = useMutation({
    mutationFn: (ssid: string) => trpc["admin.network.forget"].mutate({ ssid }),
    onSuccess: () => {
      toast.success("Network forgotten");
      invalidateNetwork();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleForget = (ssid: string) => {
    if (status && needsForgetWarning(status, ssid)) {
      setForgetWarningSsid(ssid);
      return;
    }
    forgetMutation.mutate(ssid);
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted-foreground">
        <Spinner /> Loading network status...
      </div>
    );
  }

  if (!status) return null;

  const forgettingSsid = forgetMutation.isPending ? (forgetMutation.variables ?? null) : null;
  const savedNotConnected = status.saved.filter((s) => s.ssid !== status.current?.ssid);
  const savedSsids = new Set(status.saved.map((s) => s.ssid));
  const availableUnsaved = status.available
    .filter((n) => n.ssid !== status.current?.ssid && !savedSsids.has(n.ssid))
    .sort((a, b) => b.signal - a.signal);

  const hasNetworks = !!(
    status.current ||
    savedNotConnected.length > 0 ||
    availableUnsaved.length > 0
  );

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => toggleWifiMutation.mutate()}
          disabled={toggleWifiMutation.isPending}
        >
          {toggleWifiMutation.isPending ? <Spinner className="mr-1" /> : null}
          {status.enabled ? "Disable WiFi" : "Enable WiFi"}
        </Button>
        {status.enabled && (
          <Button variant="outline" size="sm" onClick={invalidateNetwork}>
            Scan
          </Button>
        )}
        {status.ethernet && <Badge className="bg-success text-white">Ethernet connected</Badge>}
      </div>

      {!status.enabled && <p className="italic text-muted-foreground">WiFi is disabled.</p>}

      {status.enabled && hasNetworks && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableBody>
                {status.current && (
                  <ConnectedRow
                    current={status.current}
                    forgettingSsid={forgettingSsid}
                    onForget={handleForget}
                  />
                )}
                {savedNotConnected.length > 0 && (
                  <>
                    <SectionLabel label="Saved" />
                    {savedNotConnected.map((net) => (
                      <SavedRow
                        key={net.ssid}
                        network={net}
                        forgettingSsid={forgettingSsid}
                        onForget={handleForget}
                      />
                    ))}
                  </>
                )}
                {availableUnsaved.length > 0 && (
                  <>
                    <SectionLabel label="Available" />
                    {availableUnsaved.map((net) => (
                      <AvailableRow key={net.ssid} network={net} />
                    ))}
                  </>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {status.enabled && !hasNetworks && (
        <p className="italic text-muted-foreground">No networks found. Click Scan to search.</p>
      )}

      {status.enabled && <HiddenNetworkSection />}

      <ConfirmDialog
        open={forgetWarningSsid !== null}
        onOpenChange={(open) => !open && setForgetWarningSsid(null)}
        title="Warning"
        description="This is your only connection. The device will go offline. Plug in Ethernet before removing this network."
        confirmLabel="Forget anyway"
        variant="destructive"
        onConfirm={() => {
          if (forgetWarningSsid) forgetMutation.mutate(forgetWarningSsid);
        }}
      />
    </div>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell
        colSpan={4}
        className="pt-4 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide"
      >
        {label}
      </TableCell>
    </TableRow>
  );
}

function ForgetButton({
  ssid,
  forgettingSsid,
  onForget,
}: {
  ssid: string;
  forgettingSsid: string | null;
  onForget: (ssid: string) => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-muted-foreground hover:text-destructive"
      aria-label="Forget network"
      disabled={forgettingSsid === ssid}
      onClick={(e) => {
        e.stopPropagation();
        onForget(ssid);
      }}
    >
      <Trash2 className="size-4" />
    </Button>
  );
}

function ConnectedRow({
  current,
  forgettingSsid,
  onForget,
}: {
  current: NonNullable<WifiStatus["current"]>;
  forgettingSsid: string | null;
  onForget: (ssid: string) => void;
}) {
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

function SavedRow({
  network,
  forgettingSsid,
  onForget,
}: {
  network: WifiStatus["saved"][number];
  forgettingSsid: string | null;
  onForget: (ssid: string) => void;
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

function AvailableRow({ network }: { network: WifiNetwork }) {
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
        <TableCell className="w-12" />
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

function HiddenNetworkSection() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");

  const connectMutation = useMutation({
    mutationFn: (input: { ssid: string; password?: string }) =>
      trpc["admin.network.connect"].mutate(input),
    onSuccess: () => {
      toast.success("Connected");
      setShowForm(false);
      setSsid("");
      setPassword("");
      queryClient.invalidateQueries({ queryKey: queryKeys.network.status() });
    },
    onError: () => toast.error("Could not connect — check password and try again"),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!ssid.trim()) return;
    connectMutation.mutate({ ssid: ssid.trim(), password: password || undefined });
  };

  if (!showForm) {
    return (
      <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
        Connect to hidden network
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Hidden Network</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
          <Input
            type="text"
            placeholder="Network name (SSID)"
            value={ssid}
            onChange={(e) => setSsid(e.target.value)}
            disabled={connectMutation.isPending}
            className="w-auto min-w-[200px]"
          />
          <Input
            type="password"
            placeholder="Password (optional)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={connectMutation.isPending}
            className="w-auto min-w-[200px]"
          />
          <Button type="submit" size="sm" disabled={connectMutation.isPending || !ssid.trim()}>
            {connectMutation.isPending ? <Spinner className="mr-1" /> : null}
            Connect
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setShowForm(false);
              setSsid("");
              setPassword("");
            }}
          >
            Cancel
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
