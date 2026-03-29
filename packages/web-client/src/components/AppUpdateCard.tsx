import { AppUpdateResult, type AppUpdateStatus, AppUpdateStep } from "@kioskkit/shared";
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
  Spinner,
} from "@kioskkit/ui";
import { useMemo, useState } from "react";
import {
  useAppCancelDownload,
  useAppDownload,
  useAppInstall,
  useAppRollback,
  useAppUpdateStatus,
  useLatestAppRelease,
} from "../hooks/app-update.js";
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
}

function deriveCardState(status: AppUpdateStatus, latestVersion?: string): CardState {
  switch (status.status) {
    case AppUpdateStep.Uploading:
      return CardState.Downloading;
    case AppUpdateStep.Downloaded:
      return CardState.Downloaded;
    case AppUpdateStep.Installing:
      return CardState.Installing;
    case AppUpdateStep.RollingBack:
      return CardState.Failed;
    case AppUpdateStep.Idle: {
      if (status.lastResult === AppUpdateResult.Success) return CardState.Success;
      if (status.lastResult !== null) return CardState.Failed;
      if (latestVersion && status.currentVersion !== latestVersion)
        return CardState.UpdateAvailable;
      return CardState.UpToDate;
    }
  }
}

export function AppUpdateCard({ deviceId }: { deviceId: string }) {
  const t = useTranslate();
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: release } = useLatestAppRelease();
  const {
    data: appStatus,
    isLoading,
    error: statusError,
  } = useAppUpdateStatus(deviceId, {
    refetchInterval: (query) => {
      const data = (query as { state: { data: AppUpdateStatus | undefined } }).state.data;
      if (!data) return false;
      if (data.status === AppUpdateStep.Uploading) return 3000;
      if (data.status === AppUpdateStep.Installing) return 5000;
      return false;
    },
  });

  const cardState = useMemo(
    () => (appStatus ? deriveCardState(appStatus, release?.version) : null),
    [appStatus, release?.version],
  );

  const appDownload = useAppDownload(deviceId);
  const appInstall = useAppInstall(deviceId);
  const appRollback = useAppRollback(deviceId);
  const appCancel = useAppCancelDownload(deviceId);

  const actionLoading =
    appDownload.isPending || appInstall.isPending || appRollback.isPending || appCancel.isPending;

  const handleDownload = () => {
    setActionError(null);
    if (release) {
      appDownload.mutate(release.version, {
        onError: (e) => setActionError(e instanceof Error ? e.message : "Download failed"),
      });
    }
  };

  const handleCancel = () => {
    setActionError(null);
    appCancel.mutate(undefined, {
      onError: (e) => setActionError(e instanceof Error ? e.message : "Cancel failed"),
    });
  };

  const handleInstall = () => {
    setActionError(null);
    appInstall.mutate(undefined, {
      onError: (e) => setActionError(e instanceof Error ? e.message : "Install failed"),
    });
  };

  const handleRollback = () => {
    setActionError(null);
    appRollback.mutate(undefined, {
      onError: (e) => setActionError(e instanceof Error ? e.message : "Rollback failed"),
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-4">
          <Spinner className="h-4 w-4" />
          <span className="text-muted-foreground text-sm">{t("appUpdate.checkingForUpdates")}</span>
        </CardContent>
      </Card>
    );
  }

  if (statusError || !appStatus || !cardState) {
    return (
      <Card>
        <CardContent className="py-4">
          <p className="text-destructive text-sm">{t("appUpdate.loadError")}</p>
        </CardContent>
      </Card>
    );
  }

  const currentVersion = appStatus.currentVersion;
  const latestVersion = release?.version;
  const uploadProgress = appStatus.upload;
  const isNotLatest = currentVersion && latestVersion && currentVersion !== latestVersion;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{t("appUpdate.title")}</span>
          {currentVersion && (
            <span className="text-muted-foreground text-xs">
              {t("appUpdate.currentVersion", { version: currentVersion })}
            </span>
          )}
        </div>

        {actionError && <p className="text-destructive text-xs">{actionError}</p>}

        {cardState === CardState.UpToDate && (
          <p className="text-muted-foreground text-sm">
            {currentVersion
              ? t("appUpdate.upToDate", { version: currentVersion })
              : t("appUpdate.upToDateNoVersion")}
          </p>
        )}

        {cardState === CardState.UpdateAvailable && (
          <div className="flex items-center justify-between">
            <p className="text-sm">
              {t("appUpdate.updateAvailable", { version: latestVersion ?? "" })}
            </p>
            <Button
              size="sm"
              onClick={handleDownload}
              loading={appDownload.isPending}
              disabled={actionLoading}
            >
              {t("appUpdate.download")}
            </Button>
          </div>
        )}

        {cardState === CardState.Downloading && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-sm">
                {t("appUpdate.downloadingVersion", {
                  version: uploadProgress?.version ?? latestVersion ?? "",
                })}
              </p>
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
                ? ` — ${formatFileSize(uploadProgress.bytesReceived)} / ${formatFileSize(uploadProgress.bytesTotal)}`
                : ""}
            </p>
          </div>
        )}

        {cardState === CardState.Downloaded && (
          <div className="flex items-center justify-between">
            <p className="text-sm">
              {t("appUpdate.readyToInstall", { version: latestVersion ?? "" })}
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleCancel} disabled={actionLoading}>
                {t("common.cancel")}
              </Button>
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="sm" disabled={actionLoading}>
                    {t("appUpdate.installUpdate")}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t("appUpdate.installDialog.title")}</DialogTitle>
                    <DialogDescription>
                      {t("appUpdate.installDialog.description")}
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline">{t("common.cancel")}</Button>
                    </DialogClose>
                    <DialogClose asChild>
                      <Button onClick={handleInstall}>{t("appUpdate.confirmInstall")}</Button>
                    </DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        )}

        {cardState === CardState.Installing && (
          <div className="flex items-center gap-2">
            <Spinner className="h-4 w-4" />
            <p className="text-sm">{t("appUpdate.installing")}</p>
          </div>
        )}

        {cardState === CardState.Success && (
          <p className="text-sm text-green-600">
            {t("appUpdate.updateSuccess", { version: currentVersion ?? "" })}
          </p>
        )}

        {cardState === CardState.Failed && (
          <div className="flex items-center justify-between">
            <p className="text-destructive text-sm">{t("appUpdate.updateFailed")}</p>
            {isNotLatest && (
              <Button size="sm" variant="outline" onClick={handleDownload} disabled={actionLoading}>
                {t("appUpdate.retry")}
              </Button>
            )}
          </div>
        )}

        {appStatus.rollbackAvailable &&
          (cardState === CardState.UpToDate ||
            cardState === CardState.Success ||
            cardState === CardState.Failed) && (
            <Button size="sm" variant="outline" onClick={handleRollback} disabled={actionLoading}>
              {t("appUpdate.rollback")}
            </Button>
          )}
      </CardContent>
    </Card>
  );
}
