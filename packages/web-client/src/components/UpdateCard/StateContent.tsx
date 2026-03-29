import type { UpdateType } from "@kioskkit/shared";
import { UpdateResult } from "@kioskkit/shared";
import { Button, ProgressBar, Spinner } from "@kioskkit/ui";
import { format } from "date-fns";
import { useTranslate } from "../../hooks/useTranslate.js";
import { CardState, type useUpdateCardState } from "../../hooks/useUpdateCardState.js";
import { formatFileSize } from "../../lib/format.js";
import { DownloadedContent } from "./DownloadedContent.js";

function getUpdateTypeLabel(
  type: UpdateType | null,
  t: ReturnType<typeof useTranslate>,
): string | null {
  if (type === "live") return t("update.typeLive");
  if (type === "full") return t("update.typeFull");
  return null;
}

export function StateContent({
  card,
  onPush,
  onInstall,
  onCancel,
}: {
  card: ReturnType<typeof useUpdateCardState>;
  onPush: () => void;
  onInstall: () => void;
  onCancel: () => void;
}) {
  const t = useTranslate();
  const { derived, actionLoading } = card;

  switch (derived.state) {
    case CardState.UpToDate:
      return (
        <p className="text-muted-foreground text-sm">
          {t("update.upToDate", { version: derived.currentVersion ?? "" })}
        </p>
      );

    case CardState.UpdateAvailable: {
      const typeLabel = getUpdateTypeLabel(derived.type, t);
      return (
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <p className="text-sm">
              v{derived.targetVersion}
              {card.updateInfo?.publishedAt
                ? ` \u00b7 ${format(card.updateInfo.publishedAt, "MMMM d, yyyy")}`
                : ""}
            </p>
            {typeLabel && <span className="text-muted-foreground text-xs">{typeLabel}</span>}
          </div>
          <Button size="sm" onClick={onPush} loading={card.push.isPending} disabled={actionLoading}>
            {t("update.download")}
          </Button>
        </div>
      );
    }

    case CardState.Downloading: {
      const upload = card.deviceStatus?.upload;
      const progress = upload?.progress ?? 0;
      const detail = upload
        ? `${progress}% \u2014 ${formatFileSize(upload.bytesReceived)} / ${formatFileSize(upload.bytesTotal)}`
        : `${progress}%`;
      return (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-sm">{t("update.downloading")}</p>
            <Button size="sm" variant="outline" onClick={onCancel} disabled={actionLoading}>
              {t("common.cancel")}
            </Button>
          </div>
          <ProgressBar progress={progress} detail={detail} />
        </div>
      );
    }

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
      return (
        <div className="flex items-center gap-2">
          <Spinner className="h-4 w-4" />
          <p className="text-sm">
            {derived.type === "full" ? t("update.rebooting") : t("update.installing")}
          </p>
        </div>
      );

    case CardState.Success:
      return (
        <p className="text-sm text-green-600">
          {t("update.success", { version: derived.currentVersion ?? "" })}
        </p>
      );

    case CardState.Failed:
      return (
        <div className="flex items-center justify-between">
          <p className="text-destructive text-sm">
            {card.deviceStatus?.lastResult === UpdateResult.FailedHealthCheck
              ? t("update.rolledBack", { version: derived.currentVersion ?? "" })
              : t("update.failed")}
          </p>
          {derived.type && (
            <Button size="sm" variant="outline" onClick={onPush} disabled={actionLoading}>
              {t("update.retry")}
            </Button>
          )}
        </div>
      );
  }
}
