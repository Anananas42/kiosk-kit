import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@kioskkit/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import type { OtaStatus, ReleaseInfo } from "../api.js";
import {
  cancelOtaDownload,
  fetchDeviceStatus,
  fetchLatestRelease,
  fetchOtaStatus,
  triggerOtaDownload,
  triggerOtaInstall,
  triggerOtaRollback,
} from "../api.js";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

type ViewState =
  | "loading"
  | "error"
  | "up-to-date"
  | "update-available"
  | "downloading"
  | "downloaded"
  | "installing"
  | "confirming"
  | "success"
  | "failed-rollback";

function deriveViewState(ota: OtaStatus | null, release: ReleaseInfo | null): ViewState {
  if (!ota) return "loading";

  // Check last result first for terminal states
  if (ota.status === "idle" && ota.lastResult === "success") return "success";
  if (ota.status === "rollback") return "failed-rollback";
  if (ota.status === "idle" && ota.lastResult && ota.lastResult !== "success")
    return "failed-rollback";

  if (ota.status === "uploading") return "downloading";
  if (ota.status === "downloaded") return "downloaded";
  if (ota.status === "installing") return "installing";
  if (ota.status === "confirming") return "confirming";

  // idle with no special lastResult
  if (ota.status === "idle") {
    if (!release) return "up-to-date";
    if (ota.currentVersion === release.version) return "up-to-date";
    return "update-available";
  }

  return "loading";
}

function shouldPoll(state: ViewState): boolean {
  return state === "downloading" || state === "installing" || state === "confirming";
}

export function OtaUpdateCard({ deviceId }: { deviceId: string }) {
  const [otaStatus, setOtaStatus] = useState<OtaStatus | null>(null);
  const [latestRelease, setLatestRelease] = useState<ReleaseInfo | null>(null);
  const [viewState, setViewState] = useState<ViewState>("loading");
  const [loadError, setLoadError] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const healthPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [ota, release] = await Promise.all([fetchOtaStatus(deviceId), fetchLatestRelease()]);
      setOtaStatus(ota);
      setLatestRelease(release);
      setViewState(deriveViewState(ota, release));
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [deviceId]);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Polling for active states
  useEffect(() => {
    if (shouldPoll(viewState)) {
      pollRef.current = setInterval(async () => {
        try {
          const ota = await fetchOtaStatus(deviceId);
          setOtaStatus(ota);
          setViewState(deriveViewState(ota, latestRelease));
        } catch {
          // Device might be rebooting — keep polling
        }
      }, 4000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [viewState, deviceId, latestRelease]);

  // Health polling during installing state (device is rebooting)
  useEffect(() => {
    if (viewState === "installing") {
      healthPollRef.current = setInterval(async () => {
        const online = await fetchDeviceStatus(deviceId);
        if (online) {
          // Device is back — refresh OTA status
          refresh();
        }
      }, 5000);
    }
    return () => {
      if (healthPollRef.current) clearInterval(healthPollRef.current);
    };
  }, [viewState, deviceId, refresh]);

  const handleDownload = async () => {
    if (!latestRelease) return;
    setActionLoading(true);
    try {
      await triggerOtaDownload(
        deviceId,
        `/api/ota/image/${latestRelease.version}`,
        latestRelease.version,
        latestRelease.sha256,
      );
      await refresh();
    } catch {
      // Error handled by status refresh
    } finally {
      setActionLoading(false);
    }
  };

  const handleInstall = async () => {
    setActionLoading(true);
    try {
      await triggerOtaInstall(deviceId);
      await refresh();
    } catch {
      // Error handled by status refresh
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    setActionLoading(true);
    try {
      await cancelOtaDownload(deviceId);
      await refresh();
    } catch {
      // Error handled by status refresh
    } finally {
      setActionLoading(false);
    }
  };

  const handleRollback = async () => {
    setActionLoading(true);
    try {
      await triggerOtaRollback(deviceId);
      await refresh();
    } catch {
      // Error handled by status refresh
    } finally {
      setActionLoading(false);
    }
  };

  if (loadError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Software Update</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Unable to fetch update status from device.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (viewState === "loading") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Software Update</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <span className="text-muted-foreground text-sm">Checking for updates…</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const currentVersion = otaStatus?.currentVersion ?? "unknown";
  const latestVersion = latestRelease?.version;
  const upload = otaStatus?.upload;

  const showRollbackButton =
    viewState !== "up-to-date" &&
    viewState !== "installing" &&
    viewState !== "confirming" &&
    viewState !== "success";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium">Software Update</CardTitle>
        {viewState === "up-to-date" && (
          <Badge variant="secondary" className="text-xs">
            Up to date
          </Badge>
        )}
        {viewState === "success" && (
          <Badge variant="default" className="text-xs">
            Updated
          </Badge>
        )}
        {viewState === "failed-rollback" && (
          <Badge variant="destructive" className="text-xs">
            Failed
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Up to date */}
        {viewState === "up-to-date" && (
          <p className="text-sm">Running v{currentVersion} (latest)</p>
        )}

        {/* Update available */}
        {viewState === "update-available" && latestRelease && (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">v{latestVersion} available</p>
              <p className="text-muted-foreground text-xs">Currently running v{currentVersion}</p>
            </div>
            {latestRelease.releaseNotes && (
              <div className="bg-muted rounded-md p-3">
                <p className="text-xs font-medium mb-1">Release notes</p>
                <p className="text-muted-foreground text-xs whitespace-pre-wrap">
                  {latestRelease.releaseNotes}
                </p>
              </div>
            )}
            <Button size="sm" onClick={handleDownload} disabled={actionLoading}>
              {actionLoading ? "Starting…" : "Download"}
            </Button>
          </div>
        )}

        {/* Downloading */}
        {viewState === "downloading" && upload && (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">Downloading v{upload.version}</p>
              <p className="text-muted-foreground text-xs">
                {formatBytes(upload.bytesReceived)} / {formatBytes(upload.bytesTotal)}
                {" — "}
                {Math.round(upload.progress)}%
              </p>
            </div>
            <div className="bg-secondary h-2 w-full overflow-hidden rounded-full">
              <div
                className="bg-primary h-full transition-all duration-300"
                style={{ width: `${Math.min(upload.progress, 100)}%` }}
              />
            </div>
            <Button size="sm" variant="outline" onClick={handleCancel} disabled={actionLoading}>
              Cancel
            </Button>
          </div>
        )}

        {/* Downloaded — ready to install */}
        {viewState === "downloaded" && (
          <div className="space-y-3">
            <p className="text-sm font-medium">
              v{upload?.version ?? latestVersion} downloaded and verified
            </p>
            <div className="flex gap-2">
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="sm">Install &amp; Reboot</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Install update and reboot?</DialogTitle>
                    <DialogDescription className="space-y-2 pt-2">
                      <span className="block">
                        This will reboot the device. It will be offline for approximately 1-2
                        minutes.
                      </span>
                      <span className="block">
                        If the update fails, the device will automatically roll back to the previous
                        version.
                      </span>
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline">Cancel</Button>
                    </DialogClose>
                    <DialogClose asChild>
                      <Button onClick={handleInstall} disabled={actionLoading}>
                        Confirm
                      </Button>
                    </DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Button size="sm" variant="outline" onClick={handleCancel} disabled={actionLoading}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Installing / rebooting */}
        {viewState === "installing" && (
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <span className="text-sm">Device is rebooting…</span>
          </div>
        )}

        {/* Confirming health */}
        {viewState === "confirming" && (
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <span className="text-sm">Verifying health on new root…</span>
          </div>
        )}

        {/* Success */}
        {viewState === "success" && (
          <p className="text-sm">Updated to v{currentVersion} successfully</p>
        )}

        {/* Failed / rolled back */}
        {viewState === "failed-rollback" && (
          <div className="space-y-1">
            <p className="text-destructive text-sm font-medium">
              Update failed, rolled back to v{currentVersion}
            </p>
            <p className="text-muted-foreground text-xs">
              {otaStatus?.lastResult === "failed_health_check" &&
                "Health check failed after install."}
              {otaStatus?.lastResult === "failed_upload" &&
                "Download failed — image may be corrupted."}
              {otaStatus?.lastResult === "failed_install" && "Installation failed."}
            </p>
          </div>
        )}

        {/* Manual rollback button (always visible when not up-to-date/installing/confirming/success) */}
        {showRollbackButton && (
          <div className="border-t pt-3">
            <Button
              size="sm"
              variant="ghost"
              className="text-xs"
              onClick={handleRollback}
              disabled={actionLoading}
            >
              Rollback to previous version
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
