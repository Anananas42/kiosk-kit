import { UpdateResult, type UpdateStatus } from "@kioskkit/shared";
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
import { useState } from "react";
import { useTranslate } from "../hooks/useTranslate.js";
import { CardState, type DerivedUpdate, useUpdateCardState } from "../hooks/useUpdateCardState.js";
import { formatFileSize } from "../lib/format.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// State-specific content components
// ---------------------------------------------------------------------------

function UpToDateContent({ derived }: { derived: DerivedUpdate }) {
  const t = useTranslate();
  return (
    <p className="text-muted-foreground text-sm">
      {t("update.upToDate", { version: derived.currentVersion ?? "" })}
    </p>
  );
}

function UpdateAvailableContent({
  derived,
  publishedAt,
  onPush,
  pushPending,
  disabled,
}: {
  derived: DerivedUpdate;
  publishedAt: string | undefined;
  onPush: () => void;
  pushPending: boolean;
  disabled: boolean;
}) {
  const t = useTranslate();
  const typeLabel =
    derived.type === "live"
      ? t("update.typeLive")
      : derived.type === "full"
        ? t("update.typeFull")
        : null;

  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-col gap-0.5">
        <p className="text-sm">
          v{derived.targetVersion}
          {publishedAt ? ` \u00b7 ${formatDate(publishedAt)}` : ""}
        </p>
        {typeLabel && <span className="text-muted-foreground text-xs">{typeLabel}</span>}
      </div>
      <Button size="sm" onClick={onPush} loading={pushPending} disabled={disabled}>
        {t("update.download")}
      </Button>
    </div>
  );
}

function DownloadingContent({
  upload,
  onCancel,
  disabled,
}: {
  upload: UpdateStatus["upload"];
  onCancel: () => void;
  disabled: boolean;
}) {
  const t = useTranslate();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-sm">{t("update.downloading")}</p>
        <Button size="sm" variant="outline" onClick={onCancel} disabled={disabled}>
          {t("common.cancel")}
        </Button>
      </div>
      <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
        <div
          className="bg-primary h-full transition-all duration-300"
          style={{ width: `${upload?.progress ?? 0}%` }}
        />
      </div>
      <p className="text-muted-foreground text-xs">
        {upload?.progress ?? 0}%
        {upload
          ? ` \u2014 ${formatFileSize(upload.bytesReceived)} / ${formatFileSize(upload.bytesTotal)}`
          : ""}
      </p>
    </div>
  );
}

function DownloadedContent({
  derived,
  onInstall,
  onCancel,
  disabled,
}: {
  derived: DerivedUpdate;
  onInstall: () => void;
  onCancel: () => void;
  disabled: boolean;
}) {
  const t = useTranslate();
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm">
        {t("update.readyToInstall", { version: derived.targetVersion ?? "" })}
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={onCancel} disabled={disabled}>
          {t("common.cancel")}
        </Button>
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" disabled={disabled}>
              {t("update.install")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("update.installDialog.title")}</DialogTitle>
              <DialogDescription>
                {derived.type === "live"
                  ? t("update.installDialog.descriptionLive")
                  : t("update.installDialog.descriptionFull")}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">{t("common.cancel")}</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button onClick={onInstall}>{t("update.confirmInstall")}</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function InstallingContent({ derived }: { derived: DerivedUpdate }) {
  const t = useTranslate();
  return (
    <div className="flex items-center gap-2">
      <Spinner className="h-4 w-4" />
      <p className="text-sm">
        {derived.type === "full" ? t("update.rebooting") : t("update.installing")}
      </p>
    </div>
  );
}

function SuccessContent({ derived }: { derived: DerivedUpdate }) {
  const t = useTranslate();
  return (
    <p className="text-sm text-green-600">
      {t("update.success", { version: derived.currentVersion ?? "" })}
    </p>
  );
}

function FailedContent({
  derived,
  lastResult,
  onRetry,
  disabled,
}: {
  derived: DerivedUpdate;
  lastResult: UpdateStatus["lastResult"];
  onRetry: () => void;
  disabled: boolean;
}) {
  const t = useTranslate();
  return (
    <div className="flex items-center justify-between">
      <p className="text-destructive text-sm">
        {lastResult === UpdateResult.FailedHealthCheck
          ? t("update.rolledBack", { version: derived.currentVersion ?? "" })
          : t("update.failed")}
      </p>
      {derived.type && (
        <Button size="sm" variant="outline" onClick={onRetry} disabled={disabled}>
          {t("update.retry")}
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function UpdateCard({ deviceId }: { deviceId: string }) {
  const t = useTranslate();
  const [actionError, setActionError] = useState<string | null>(null);
  const card = useUpdateCardState(deviceId);

  const onError = (e: Error) => setActionError(e.message ?? t("update.failed"));

  const handlePush = () => {
    setActionError(null);
    card.push.mutate(undefined, { onError });
  };

  const handleInstall = () => {
    setActionError(null);
    card.install.mutate(undefined, { onError });
  };

  const handleCancel = () => {
    setActionError(null);
    card.cancel.mutate(undefined, { onError });
  };

  // Loading
  if (card.isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-4">
          <Spinner className="h-4 w-4" />
          <span className="text-muted-foreground text-sm">{t("update.checking")}</span>
        </CardContent>
      </Card>
    );
  }

  // Error — neither source returned data
  if (!card.hasData) {
    return (
      <Card>
        <CardContent className="py-4">
          <p className="text-destructive text-sm">{t("update.loadError")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{t("update.title")}</span>
          {card.derived.currentVersion && (
            <span className="text-muted-foreground text-xs">
              {t("update.currentVersion", { version: card.derived.currentVersion })}
            </span>
          )}
        </div>

        {actionError && <p className="text-destructive text-xs">{actionError}</p>}

        {renderStateContent(card, handlePush, handleInstall, handleCancel)}
      </CardContent>
    </Card>
  );
}

function renderStateContent(
  card: ReturnType<typeof useUpdateCardState>,
  onPush: () => void,
  onInstall: () => void,
  onCancel: () => void,
) {
  const { derived, actionLoading } = card;

  switch (derived.state) {
    case CardState.UpToDate:
      return <UpToDateContent derived={derived} />;
    case CardState.UpdateAvailable:
      return (
        <UpdateAvailableContent
          derived={derived}
          publishedAt={card.updateInfo?.publishedAt}
          onPush={onPush}
          pushPending={card.push.isPending}
          disabled={actionLoading}
        />
      );
    case CardState.Downloading:
      return (
        <DownloadingContent
          upload={card.deviceStatus?.upload ?? null}
          onCancel={onCancel}
          disabled={actionLoading}
        />
      );
    case CardState.Downloaded:
      return (
        <DownloadedContent
          derived={derived}
          onInstall={onInstall}
          onCancel={onCancel}
          disabled={actionLoading}
        />
      );
    case CardState.Installing:
      return <InstallingContent derived={derived} />;
    case CardState.Success:
      return <SuccessContent derived={derived} />;
    case CardState.Failed:
      return (
        <FailedContent
          derived={derived}
          lastResult={card.deviceStatus?.lastResult ?? null}
          onRetry={onPush}
          disabled={actionLoading}
        />
      );
  }
}
