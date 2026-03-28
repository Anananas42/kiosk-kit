import type { WifiStatus } from "@kioskkit/shared";
import { Badge, Button, Card, CardContent, Spinner, Table, TableBody } from "@kioskkit/ui";
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
