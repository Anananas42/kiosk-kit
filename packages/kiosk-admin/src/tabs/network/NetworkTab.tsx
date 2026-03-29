import type { WifiStatus } from "@kioskkit/shared";
import { Badge, Button, Card, CardContent, Skeleton, Table, TableBody } from "@kioskkit/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "../../components/ConfirmDialog.js";
import { queryKeys } from "../../lib/query.js";
import { trpc } from "../../trpc.js";
import { AvailableRow } from "./AvailableRow.js";
import { ConnectedRow } from "./ConnectedRow.js";
import { HiddenNetworkForm } from "./HiddenNetworkForm.js";
import { SavedRow } from "./SavedRow.js";
import { SectionLabel } from "./SectionLabel.js";

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
  const [expandedNetwork, setExpandedNetwork] = useState<string | null>(null);

  const {
    data: status,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: queryKeys.network.status(),
    queryFn: () => trpc["admin.network.list"].query(),
    refetchInterval: (query) => (query.state.data?.enabled ? 10_000 : false),
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

  const handleToggle = (ssid: string) => {
    setExpandedNetwork((prev) => (prev === ssid ? null : ssid));
  };

  if (isLoading) {
    return (
      <div className="space-y-4 pt-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-28 rounded-md" />
          <Skeleton className="h-8 w-16 rounded-md" />
        </div>
        <Card>
          <CardContent className="p-0">
            {["skeleton-1", "skeleton-2", "skeleton-3"].map((id) => (
              <div key={id} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="h-5 w-5 rounded" />
                <Skeleton className="h-4 w-40 rounded" />
              </div>
            ))}
          </CardContent>
        </Card>
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
          loading={toggleWifiMutation.isPending}
        >
          {status.enabled ? "Disable WiFi" : "Enable WiFi"}
        </Button>
        {status.enabled && (
          <Button variant="outline" size="sm" onClick={invalidateNetwork} loading={isFetching}>
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
                        expanded={expandedNetwork === net.ssid}
                        onToggle={() => handleToggle(net.ssid)}
                      />
                    ))}
                  </>
                )}
                {availableUnsaved.length > 0 && (
                  <>
                    <SectionLabel label="Available" />
                    {availableUnsaved.map((net) => (
                      <AvailableRow
                        key={net.ssid}
                        network={net}
                        expanded={expandedNetwork === net.ssid}
                        onToggle={() => handleToggle(net.ssid)}
                      />
                    ))}
                  </>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {status.enabled && !hasNetworks && (
        <p className="italic text-muted-foreground">
          {isFetching ? "Scanning for networks..." : "No networks found. Click Scan to search."}
        </p>
      )}

      {status.enabled && <HiddenNetworkForm />}

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
