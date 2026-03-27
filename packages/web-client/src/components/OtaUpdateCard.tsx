import { OtaResult, type OtaStatus, OtaStep } from "@kioskkit/shared";
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

enum CardState {
  UpToDate = "up-to-date",
  UpdateAvailable = "update-available",
  Downloading = "downloading",
  Downloaded = "downloaded",
  Installing = "installing",
  Success = "success",
  Failed = "failed",
}

function deriveCardState(otaStatus: OtaStatus, latestVersion?: string): CardState {
  switch (otaStatus.status) {
    case OtaStep.Uploading:
      return CardState.Downloading;
    case OtaStep.Downloaded:
      return CardState.Downloaded;
    case OtaStep.Installing:
      return CardState.Installing;
    case OtaStep.Rollback:
      return CardState.Failed;
    case OtaStep.Idle:
    case OtaStep.Confirming: {
      if (otaStatus.lastResult === OtaResult.Success) return CardState.Success;
      if (otaStatus.lastResult !== null) return CardState.Failed;
      if (latestVersion && otaStatus.currentVersion !== latestVersion)
        return CardState.UpdateAvailable;
      return CardState.UpToDate;
    }
  }
}

export function OtaUpdateCard({ deviceId }: { deviceId: string }) {
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: release } = useLatestRelease();
  const {
    data: otaStatus,
    isLoading,
    error: otaError,
  } = useOtaStatus(deviceId, {
    refetchInterval: (query) => {
      const data = (query as { state: { data: OtaStatus | undefined } }).state.data;
      if (!data) return false;
      if (data.status === OtaStep.Uploading) return 3000;
      if (data.status === OtaStep.Installing) return 5000;
      return false;
    },
  });

  const cardState = useMemo(
    () => (otaStatus ? deriveCardState(otaStatus, release?.version) : null),
    [otaStatus, release?.version],
  );

  // Poll device health during install to detect when device comes back online
  useDeviceStatus(deviceId, {
    refetchInterval: cardState === CardState.Installing ? 5000 : false,
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

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-4">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span className="text-muted-foreground text-sm">Checking for updates…</span>
        </CardContent>
      </Card>
    );
  }

  if (otaError || !otaStatus || !cardState) {
    return (
      <Card>
        <CardContent className="py-4">
          <p className="text-destructive text-sm">Failed to load OTA status</p>
        </CardContent>
      </Card>
    );
  }

  const currentVersion = otaStatus.currentVersion;
  const latestVersion = release?.version;
  const uploadProgress = otaStatus.upload;
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

        {cardState === CardState.UpToDate && (
          <p className="text-muted-foreground text-sm">Running v{currentVersion} (latest)</p>
        )}

        {cardState === CardState.UpdateAvailable && (
          <div className="flex items-center justify-between">
            <p className="text-sm">v{latestVersion} available</p>
            <Button size="sm" onClick={handleDownload} disabled={actionLoading}>
              {otaDownload.isPending ? "Starting…" : "Download"}
            </Button>
          </div>
        )}

        {cardState === CardState.Downloading && (
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

        {cardState === CardState.Downloaded && (
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

        {cardState === CardState.Installing && (
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <p className="text-sm">Device is rebooting…</p>
          </div>
        )}

        {cardState === CardState.Success && (
          <p className="text-sm text-green-600">Updated to v{currentVersion}</p>
        )}

        {cardState === CardState.Failed && (
          <div className="flex items-center justify-between">
            <p className="text-destructive text-sm">
              {otaStatus.lastResult === OtaResult.FailedHealthCheck
                ? `Rolled back to v${currentVersion}`
                : "Update failed"}
            </p>
            {isNotLatest && (
              <Button size="sm" variant="outline" onClick={handleDownload} disabled={actionLoading}>
                Retry
              </Button>
            )}
          </div>
        )}

        {(cardState === CardState.UpToDate || cardState === CardState.Success) && isNotLatest && (
          <Button size="sm" variant="outline" onClick={handleRollback} disabled={actionLoading}>
            Rollback
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
