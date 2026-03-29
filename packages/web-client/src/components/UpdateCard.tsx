import { UpdateResult, type UpdateStatus, UpdateStep } from "@kioskkit/shared";
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
import {
  useDeviceUpdateStatus,
  useServerUpdateStatus,
  useUpdateCancel,
  useUpdateInfo,
  useUpdateInstall,
  useUpdatePush,
} from "../hooks/update.js";
import { useTranslate } from "../hooks/useTranslate.js";
import { formatFileSize } from "../lib/format.js";

enum CardState {
  UpToDate = "up-to-date",
  UpdateAvailable = "update-available",
  Downloading = "downloading",
  Downloaded = "downloaded",
  Installing = "installing",
  Success = "success",
  Failed = "failed",
  ServerInProgress = "server-in-progress",
}

interface DerivedState {
  cardState: CardState;
  updateType: "live" | "full" | null;
  targetVersion: string | null;
}

function deriveCardState(
  deviceStatus: UpdateStatus | undefined,
  deviceStatusError: boolean,
  serverOp: { action: string; updateType: string; version: string } | null,
  updateType: "full" | "live" | "up_to_date" | undefined,
): DerivedState {
  // If device responds, use it as primary source
  if (deviceStatus) {
    const type = updateType === "live" || updateType === "full" ? updateType : null;

    switch (deviceStatus.status) {
      case UpdateStep.Uploading:
        return {
          cardState: CardState.Downloading,
          updateType: type,
          targetVersion: deviceStatus.upload?.version ?? null,
        };
      case UpdateStep.Downloaded:
        return {
          cardState: CardState.Downloaded,
          updateType: type,
          targetVersion: deviceStatus.upload?.version ?? null,
        };
      case UpdateStep.Installing:
        return { cardState: CardState.Installing, updateType: type, targetVersion: null };
      case UpdateStep.RollingBack:
        return { cardState: CardState.Failed, updateType: type, targetVersion: null };
      case UpdateStep.Idle: {
        if (deviceStatus.lastResult === UpdateResult.Success)
          return { cardState: CardState.Success, updateType: type, targetVersion: null };
        if (deviceStatus.lastResult !== null)
          return { cardState: CardState.Failed, updateType: type, targetVersion: null };
        return { cardState: CardState.UpToDate, updateType: type, targetVersion: null };
      }
    }
  }

  // Device unreachable — fall back to server op
  if (deviceStatusError && serverOp) {
    const type = serverOp.updateType === "live" ? ("live" as const) : ("full" as const);
    if (serverOp.action === "push")
      return {
        cardState: CardState.ServerInProgress,
        updateType: type,
        targetVersion: serverOp.version,
      };
    if (serverOp.action === "install")
      return { cardState: CardState.Installing, updateType: type, targetVersion: serverOp.version };
  }

  // Default
  return { cardState: CardState.UpToDate, updateType: null, targetVersion: null };
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function UpdateCard({ deviceId }: { deviceId: string }) {
  const t = useTranslate();
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: updateInfo, isLoading: infoLoading } = useUpdateInfo(deviceId);

  const {
    data: deviceStatus,
    isLoading: deviceStatusLoading,
    error: deviceStatusError,
  } = useDeviceUpdateStatus(deviceId, {
    refetchInterval: (query) => {
      const data = (query as { state: { data: UpdateStatus | undefined } }).state.data;
      if (!data) return false;
      if (data.status === UpdateStep.Uploading) return 3000;
      if (data.status === UpdateStep.Installing) return 5000;
      return false;
    },
  });

  const { data: serverStatus } = useServerUpdateStatus(deviceId, !!deviceStatusError);

  const derived = useMemo(
    () =>
      deriveCardState(
        deviceStatus,
        !!deviceStatusError,
        serverStatus?.operation ?? null,
        updateInfo?.type,
      ),
    [deviceStatus, deviceStatusError, serverStatus?.operation, updateInfo?.type],
  );

  const { cardState, updateType } = derived;

  const hasUpdate = updateInfo?.type === "live" || updateInfo?.type === "full";
  const effectiveCardState =
    cardState === CardState.UpToDate && hasUpdate ? CardState.UpdateAvailable : cardState;

  const updatePush = useUpdatePush(deviceId);
  const updateInstall = useUpdateInstall(deviceId);
  const updateCancel = useUpdateCancel(deviceId);

  const actionLoading = updatePush.isPending || updateInstall.isPending || updateCancel.isPending;

  const handlePush = () => {
    setActionError(null);
    updatePush.mutate(undefined, {
      onError: (e) => setActionError(e instanceof Error ? e.message : "Download failed"),
    });
  };

  const handleInstall = () => {
    setActionError(null);
    updateInstall.mutate(undefined, {
      onError: (e) => setActionError(e instanceof Error ? e.message : "Install failed"),
    });
  };

  const handleCancel = () => {
    setActionError(null);
    updateCancel.mutate(undefined, {
      onError: (e) => setActionError(e instanceof Error ? e.message : "Cancel failed"),
    });
  };

  if (infoLoading || deviceStatusLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-4">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span className="text-muted-foreground text-sm">{t("update.checking")}</span>
        </CardContent>
      </Card>
    );
  }

  if (!updateInfo && !deviceStatus) {
    return (
      <Card>
        <CardContent className="py-4">
          <p className="text-destructive text-sm">{t("update.loadError")}</p>
        </CardContent>
      </Card>
    );
  }

  const currentVersion = deviceStatus?.currentVersion ?? updateInfo?.currentVersion;
  const targetVersion = derived.targetVersion ?? updateInfo?.targetVersion ?? null;
  const uploadProgress = deviceStatus?.upload;
  const typeLabel =
    updateType === "live"
      ? t("update.typeLive")
      : updateType === "full"
        ? t("update.typeFull")
        : null;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{t("update.title")}</span>
          {currentVersion && (
            <span className="text-muted-foreground text-xs">
              {t("update.currentVersion", { version: currentVersion })}
            </span>
          )}
        </div>

        {actionError && <p className="text-destructive text-xs">{actionError}</p>}

        {effectiveCardState === CardState.UpToDate && (
          <p className="text-muted-foreground text-sm">
            {t("update.upToDate", { version: currentVersion ?? "" })}
          </p>
        )}

        {effectiveCardState === CardState.UpdateAvailable && (
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <p className="text-sm">
                v{targetVersion}
                {updateInfo?.publishedAt ? ` \u00b7 ${formatDate(updateInfo.publishedAt)}` : ""}
              </p>
              {typeLabel && <span className="text-muted-foreground text-xs">{typeLabel}</span>}
            </div>
            <Button
              size="sm"
              onClick={handlePush}
              loading={updatePush.isPending}
              disabled={actionLoading}
            >
              {t("update.download")}
            </Button>
          </div>
        )}

        {effectiveCardState === CardState.Downloading && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-sm">{t("update.downloading")}</p>
              <Button size="sm" variant="outline" onClick={handleCancel} disabled={actionLoading}>
                {t("common.cancel")}
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
                ? ` \u2014 ${formatFileSize(uploadProgress.bytesReceived)} / ${formatFileSize(uploadProgress.bytesTotal)}`
                : ""}
            </p>
          </div>
        )}

        {effectiveCardState === CardState.Downloaded && (
          <div className="flex items-center justify-between">
            <p className="text-sm">
              {t("update.readyToInstall", { version: targetVersion ?? "" })}
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleCancel} disabled={actionLoading}>
                {t("common.cancel")}
              </Button>
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="sm" disabled={actionLoading}>
                    {t("update.install")}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t("update.installDialog.title")}</DialogTitle>
                    <DialogDescription>
                      {updateType === "live"
                        ? t("update.installDialog.descriptionLive")
                        : t("update.installDialog.descriptionFull")}
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline">{t("common.cancel")}</Button>
                    </DialogClose>
                    <DialogClose asChild>
                      <Button onClick={handleInstall}>{t("update.confirmInstall")}</Button>
                    </DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        )}

        {effectiveCardState === CardState.Installing && (
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <p className="text-sm">
              {updateType === "full" ? t("update.rebooting") : t("update.installing")}
            </p>
          </div>
        )}

        {effectiveCardState === CardState.ServerInProgress && (
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <p className="text-sm">{t("update.downloading")}</p>
          </div>
        )}

        {effectiveCardState === CardState.Success && (
          <p className="text-sm text-green-600">
            {t("update.success", { version: currentVersion ?? "" })}
          </p>
        )}

        {effectiveCardState === CardState.Failed && (
          <div className="flex items-center justify-between">
            <p className="text-destructive text-sm">
              {deviceStatus?.lastResult === UpdateResult.FailedHealthCheck
                ? t("update.rolledBack", { version: currentVersion ?? "" })
                : t("update.failed")}
            </p>
            {hasUpdate && (
              <Button size="sm" variant="outline" onClick={handlePush} disabled={actionLoading}>
                {t("update.retry")}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
