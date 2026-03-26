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
import { fetchBackupDownloadUrl, restoreBackup } from "./api.js";
import { formatFileSize, formatRelativeTime } from "./format.js";

/**
 * Backup freshness thresholds (in hours) mapped to Tailwind dot colors.
 * Green = less than 24 h, yellow = 24–72 h, red = older than 72 h.
 */
export const BACKUP_STATUS_COLORS = {
  fresh: "bg-green-500", // < 24 hours
  stale: "bg-yellow-500", // 24–72 hours
  outdated: "bg-red-500", // > 72 hours
  none: "bg-gray-400", // no backup
} as const;

/** Returns the dot color class for a given backup timestamp. */
export function getBackupDotColor(lastBackupAt?: string | null): string {
  if (!lastBackupAt) return BACKUP_STATUS_COLORS.none;
  const hoursAgo = (Date.now() - new Date(lastBackupAt).getTime()) / (1000 * 60 * 60);
  if (hoursAgo < 24) return BACKUP_STATUS_COLORS.fresh;
  if (hoursAgo < 72) return BACKUP_STATUS_COLORS.stale;
  return BACKUP_STATUS_COLORS.outdated;
}

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
  const [showAll, setShowAll] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [restoreResult, setRestoreResult] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  async function handleDownload(backupId: string) {
    setDownloadingId(backupId);
    try {
      const url = await fetchBackupDownloadUrl(backupId);
      window.open(url, "_blank");
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleRestore(backupId: string) {
    setRestoringId(backupId);
    setRestoreResult(null);
    try {
      await restoreBackup(backupId);
      setRestoreResult({ type: "success", message: "Backup restored successfully." });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Restore failed";
      setRestoreResult({ type: "error", message });
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Backups</CardTitle>
        {backups.length > 0 && (
          <span className="text-muted-foreground text-xs">
            Last backup: {formatRelativeTime(backups[0].createdAt)}
          </span>
        )}
      </CardHeader>
      <CardContent>
        {restoreResult && (
          <div
            className={`mb-3 rounded-md px-3 py-2 text-sm ${
              restoreResult.type === "success"
                ? "bg-green-500/10 text-green-700 dark:text-green-400"
                : "bg-destructive/10 text-destructive"
            }`}
          >
            {restoreResult.message}
          </div>
        )}
        {backups.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No backups yet. Backups run daily when your device is online.
          </p>
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
                          disabled={deviceOnline === false || restoringId !== null}
                        >
                          {restoringId === b.id ? "Restoring\u2026" : "Restore"}
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Restore backup?</DialogTitle>
                          <DialogDescription>
                            This will replace all data on {deviceName ?? "the device"} with the
                            backup from {formatRelativeTime(b.createdAt)}. The current data will be
                            backed up automatically before the restore.
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                          <DialogClose asChild>
                            <Button variant="outline">Cancel</Button>
                          </DialogClose>
                          <DialogClose asChild>
                            <Button variant="destructive" onClick={() => handleRestore(b.id)}>
                              Restore
                            </Button>
                          </DialogClose>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={downloadingId === b.id}
                      onClick={() => handleDownload(b.id)}
                    >
                      {downloadingId === b.id ? "Downloading\u2026" : "Download"}
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
                {showAll ? "Show less" : `Show all (${backups.length})`}
              </button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
