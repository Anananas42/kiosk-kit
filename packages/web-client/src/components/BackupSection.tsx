import {
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
import { useState } from "react";
import { useBackupDownload, useRestoreBackup } from "../hooks/backups.js";
import { useTranslate } from "../hooks/useTranslate.js";
import { formatFileSize, formatRelativeTime } from "../lib/format.js";

interface Backup {
  id: string;
  sizeBytes: number;
  createdAt: string;
}

interface BackupSectionProps {
  backups: Backup[];
  deviceName?: string;
  deviceOnline?: boolean;
}

export function BackupSection({ backups, deviceName, deviceOnline }: BackupSectionProps) {
  const t = useTranslate();
  const [showAll, setShowAll] = useState(false);
  const download = useBackupDownload();
  const restore = useRestoreBackup(backups[0]?.id ?? "");

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">{t("backups.title")}</CardTitle>
        {backups.length > 0 && (
          <span className="text-muted-foreground text-xs">
            {t("backups.lastBackup", { time: formatRelativeTime(backups[0].createdAt) })}
          </span>
        )}
      </CardHeader>
      <CardContent>
        {restore.error && (
          <div className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {restore.error instanceof Error ? restore.error.message : t("backups.restoreFailed")}
          </div>
        )}
        {restore.isSuccess && (
          <div className="mb-3 rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
            {t("backups.restoreSuccess")}
          </div>
        )}
        {backups.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("backups.empty")}</p>
        ) : (
          <>
            <div className="divide-border divide-y">
              {(showAll ? backups : backups.slice(0, 10)).map((b) => (
                <div key={b.id} className="flex items-center justify-between py-2 text-sm">
                  <div className="flex items-center gap-3">
                    <span className="text-foreground">{formatRelativeTime(b.createdAt)}</span>
                    <span className="text-muted-foreground">{formatFileSize(b.sizeBytes)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={deviceOnline === false || restore.isPending}
                        >
                          {restore.isPending && restore.variables === b.id
                            ? t("backups.restoring")
                            : t("backups.restore")}
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>{t("backups.restoreDialog.title")}</DialogTitle>
                          <DialogDescription>
                            {t("backups.restoreDialog.description", {
                              deviceName: deviceName ?? "the device",
                              time: formatRelativeTime(b.createdAt),
                            })}
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                          <DialogClose asChild>
                            <Button variant="outline">{t("common.cancel")}</Button>
                          </DialogClose>
                          <DialogClose asChild>
                            <Button variant="destructive" onClick={() => restore.mutate(b.id)}>
                              {t("backups.restore")}
                            </Button>
                          </DialogClose>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={download.isPending && download.variables === b.id}
                      onClick={() => download.mutate(b.id)}
                    >
                      {download.isPending && download.variables === b.id
                        ? t("backups.downloading")
                        : t("backups.download")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            {backups.length > 10 && (
              <button
                type="button"
                className="text-primary mt-2 text-sm hover:underline"
                onClick={() => setShowAll(!showAll)}
              >
                {showAll ? t("backups.showLess") : t("backups.showAll", { count: backups.length })}
              </button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
