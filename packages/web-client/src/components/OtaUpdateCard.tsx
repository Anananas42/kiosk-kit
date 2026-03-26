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
import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelOtaDownload,
  fetchDeviceStatus,
  fetchLatestRelease,
  fetchOtaStatus,
  type OtaStatus,
  type ReleaseInfo,
  triggerOtaDownload,
  triggerOtaInstall,
  triggerOtaRollback,
} from "../api.js";

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

interface Props {
  deviceId: string;
}

export function OtaUpdateCard({ deviceId }: Props) {
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  const [otaStatus, setOtaStatus] = useState<OtaStatus | null>(null);
  const [cardState, setCardState] = useState<CardState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollOtaStatus = useCallback(
    (intervalMs: number) => {
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const status = await fetchOtaStatus(deviceId);
          setOtaStatus(status);
        } catch {
          // Keep polling — device may be rebooting
        }
      }, intervalMs);
    },
    [deviceId, stopPolling],
  );

  const pollHealth = useCallback(
    (intervalMs: number) => {
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const online = await fetchDeviceStatus(deviceId);
          if (online) {
            stopPolling();
            // Device is back — fetch new status
            const status = await fetchOtaStatus(deviceId);
            setOtaStatus(status);
          }
        } catch {
          // Keep polling
        }
      }, intervalMs);
    },
    [deviceId, stopPolling],
  );

  // Derive card state from OTA status + release info
  useEffect(() => {
    if (!otaStatus) return;

    const status = otaStatus.status;
    const lastResult = otaStatus.lastResult;

    if (status === "uploading") {
      setCardState("downloading");
      pollOtaStatus(3000);
      return;
    }

    if (status === "downloaded") {
      setCardState("downloaded");
      stopPolling();
      return;
    }

    if (status === "installing") {
      setCardState("installing");
      pollHealth(5000);
      return;
    }

    if (status === "rollback") {
      setCardState("failed");
      stopPolling();
      return;
    }

    // idle or confirming
    if (lastResult === "success") {
      setCardState("success");
      stopPolling();
      return;
    }

    if (
      lastResult === "failed_health_check" ||
      lastResult === "failed_upload" ||
      lastResult === "failed_install"
    ) {
      setCardState("failed");
      stopPolling();
      return;
    }

    // idle with no special result — check for update
    if (release && otaStatus.currentVersion !== release.version) {
      setCardState("update-available");
    } else {
      setCardState("up-to-date");
    }
    stopPolling();
  }, [otaStatus, release, pollOtaStatus, pollHealth, stopPolling]);

  // Initial fetch
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [rel, status] = await Promise.all([fetchLatestRelease(), fetchOtaStatus(deviceId)]);
        if (cancelled) return;
        setRelease(rel);
        setOtaStatus(status);
      } catch {
        if (!cancelled) {
          setCardState("error");
          setError("Failed to load OTA status");
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [deviceId]);

  // Cleanup polling on unmount
  useEffect(() => stopPolling, [stopPolling]);

  const handleDownload = async () => {
    if (!release) return;
    setActionLoading(true);
    setError(null);
    try {
      await triggerOtaDownload(deviceId, release.version);
      // Start polling for upload progress
      pollOtaStatus(3000);
      setCardState("downloading");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    setActionLoading(true);
    setError(null);
    try {
      await cancelOtaDownload(deviceId);
      const status = await fetchOtaStatus(deviceId);
      setOtaStatus(status);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cancel failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleInstall = async () => {
    setActionLoading(true);
    setError(null);
    try {
      await triggerOtaInstall(deviceId);
      setCardState("installing");
      pollHealth(5000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Install failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRollback = async () => {
    setActionLoading(true);
    setError(null);
    try {
      await triggerOtaRollback(deviceId);
      setCardState("installing");
      pollHealth(5000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rollback failed");
    } finally {
      setActionLoading(false);
    }
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
          <p className="text-destructive text-sm">{error ?? "Failed to load OTA status"}</p>
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

        {error && <p className="text-destructive text-xs">{error}</p>}

        {cardState === "up-to-date" && (
          <p className="text-muted-foreground text-sm">Running v{currentVersion} (latest)</p>
        )}

        {cardState === "update-available" && (
          <div className="flex items-center justify-between">
            <p className="text-sm">v{latestVersion} available</p>
            <Button size="sm" onClick={handleDownload} disabled={actionLoading}>
              {actionLoading ? "Starting…" : "Download"}
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
                ? ` — ${formatBytes(uploadProgress.bytesReceived)} / ${formatBytes(uploadProgress.bytesTotal)}`
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

        {/* Rollback button — shown when device is not on latest and in a stable state */}
        {(cardState === "up-to-date" || cardState === "success") && isNotLatest && (
          <Button size="sm" variant="outline" onClick={handleRollback} disabled={actionLoading}>
            Rollback
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
