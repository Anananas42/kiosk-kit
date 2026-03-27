import type { OtaStatus } from "@kioskkit/shared";
import {
  Button,
  Card,
  CardContent,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@kioskkit/ui";
import { useMemo, useState } from "react";
import { useDeviceStatus } from "../hooks/devices.js";
import {
  useLatestRelease,
  useOtaCancelDownload,
  useOtaDownload,
  useOtaInstall,
  useOtaRollback,
  useOtaStatus,
} from "../hooks/ota.js";
import { formatFileSize } from "../lib/format.js";

type CardState =
  | "loading"
  | "error"
  | "up-to-date"
  | "update-available"
  | "downloading"
  | "downloaded"
  | "installing"
  | "success"
  | "failed";

function deriveCardState(
  otaStatus: OtaStatus | undefined,
  latestVersion: string | undefined,
): CardState {
  if (!otaStatus) return "loading";

  const { status, lastResult, currentVersion } = otaStatus;

  if (status === "uploading") return "downloading";
  if (status === "downloaded") return "downloaded";
  if (status === "installing") return "installing";
  if (status === "rollback") return "failed";
  if (lastResult === "success") return "success";
  if (
    lastResult === "failed_health_check" ||
    lastResult === "failed_upload" ||
    lastResult === "failed_install"
  )
    return "failed";

  if (latestVersion && currentVersion !== latestVersion) return "update-available";
  return "up-to-date";
}

export function OtaUpdateCard({ deviceId }: { deviceId: string }) {
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: release } = useLatestRelease();

  const { data: otaStatus, error: otaError } = useOtaStatus(deviceId, {
    refetchInterval: (query) => {
      const data = (query as { state: { data: OtaStatus | undefined } }).state.data;
      if (!data) return false;
      if (data.status === "uploading") return 3000;
      if (data.status === "installing") return 5000;
      return false;
    },
  });

  const cardState = useMemo(
    () => (otaError ? ("error" as CardState) : deriveCardState(otaStatus, release?.version)),
    [otaStatus, release?.version, otaError],
  );

  // Poll device health during install to detect when device comes back online
  useDeviceStatus(deviceId, {
    refetchInterval: cardState === "installing" ? 5000 : false,
  });

  const otaDownload = useOtaDownload(deviceId);
  const otaInstall = useOtaInstall(deviceId);
  const otaRollback = useOtaRollback(deviceId);
  const otaCancel = useOtaCancelDownload(deviceId);

  const actionLoading =
    otaDownload.isPending || otaInstall.isPending || otaRollback.isPending || otaCancel.isPending;

  const handleDownload = () => {
    setActionError(null);
    if (release) {
      otaDownload.mutate(release.version, {
        onError: (e) => setActionError(e instanceof Error ? e.message : "Download failed"),
      });
    }
  };

  const handleCancel = () => {
    setActionError(null);
    otaCancel.mutate(undefined, {
      onError: (e) => setActionError(e instanceof Error ? e.message : "Cancel failed"),
    });
  };

  const handleInstall = () => {
    setActionError(null);
    otaInstall.mutate(undefined, {
      onError: (e) => setActionError(e instanceof Error ? e.message : "Install failed"),
    });
  };

  const handleRollback = () => {
    setActionError(null);
    otaRollback.mutate(undefined, {
      onError: (e) => setActionError(e instanceof Error ? e.message : "Rollback failed"),
    });
  };

  if (cardState === "loading") {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-4">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span className="text-muted-foreground text-sm">Checking for updates…</span>
        </CardContent>
      </Card>
    );
  }

  if (cardState === "error") {
    return (
      <Card>
        <CardContent className="py-4">
          <p className="text-destructive text-sm">Failed to load OTA status</p>
        </CardContent>
      </Card>
    );
  }

  const currentVersion = otaStatus?.currentVersion;
  const latestVersion = release?.version;
  const uploadProgress = otaStatus?.upload;
  const isNotLatest = currentVersion && latestVersion && currentVersion !== latestVersion;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">System Update</span>
          {currentVersion && (
            <span className="text-muted-foreground text-xs">Current: v{currentVersion}</span>
          )}
        </div>

        {actionError && <p className="text-destructive text-xs">{actionError}</p>}

        {cardState === "up-to-date" && (
          <p className="text-muted-foreground text-sm">Running v{currentVersion} (latest)</p>
        )}

        {cardState === "update-available" && (
          <div className="flex items-center justify-between">
            <p className="text-sm">v{latestVersion} available</p>
            <Button size="sm" onClick={handleDownload} disabled={actionLoading}>
              {otaDownload.isPending ? "Starting…" : "Download"}
            </Button>
          </div>
        )}

        {cardState === "downloading" && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-sm">Downloading v{uploadProgress?.version ?? latestVersion}…</p>
              <Button size="sm" variant="outline" onClick={handleCancel} disabled={actionLoading}>
                Cancel
              </Button>
            </div>
            <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
              <div
                className="bg-primary h-full transition-all duration-300"
                style={{ width: `${uploadProgress?.progress ?? 0}%` }}
              />
            </div>
            <p className="text-muted-foreground text-xs">
              {uploadProgress?.progress ?? 0}%
              {uploadProgress
                ? ` — ${formatFileSize(uploadProgress.bytesReceived)} / ${formatFileSize(uploadProgress.bytesTotal)}`
                : ""}
            </p>
          </div>
        )}

        {cardState === "downloaded" && (
          <div className="flex items-center justify-between">
            <p className="text-sm">Ready to install v{latestVersion}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleCancel} disabled={actionLoading}>
                Cancel
              </Button>
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="sm" disabled={actionLoading}>
                    Install &amp; Reboot
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Install Update &amp; Reboot</DialogTitle>
                    <DialogDescription>
                      The device will be offline for approximately 1–2 minutes during the update. If
                      the update fails, the device will automatically roll back to the previous
                      version.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline">Cancel</Button>
                    </DialogClose>
                    <DialogClose asChild>
                      <Button onClick={handleInstall}>Confirm Install</Button>
                    </DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        )}

        {cardState === "installing" && (
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <p className="text-sm">Device is rebooting…</p>
          </div>
        )}

        {cardState === "success" && (
          <p className="text-sm text-green-600">Updated to v{currentVersion}</p>
        )}

        {cardState === "failed" && (
          <div className="flex items-center justify-between">
            <p className="text-destructive text-sm">
              {otaStatus?.lastResult === "failed_health_check"
                ? `Rolled back to v${currentVersion}`
                : `Update failed`}
            </p>
            {isNotLatest && (
              <Button size="sm" variant="outline" onClick={handleDownload} disabled={actionLoading}>
                Retry
              </Button>
            )}
          </div>
        )}

        {(cardState === "up-to-date" || cardState === "success") && isNotLatest && (
          <Button size="sm" variant="outline" onClick={handleRollback} disabled={actionLoading}>
            Rollback
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
