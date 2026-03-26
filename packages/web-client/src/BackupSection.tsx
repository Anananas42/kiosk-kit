import { Button, Card, CardContent, CardHeader, CardTitle } from "@kioskkit/ui";
import { useState } from "react";
import { fetchBackupDownloadUrl } from "./api.js";
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

export function BackupSection({ backups }: { backups: Backup[] }) {
  const [showAll, setShowAll] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function handleDownload(backupId: string) {
    setDownloadingId(backupId);
    try {
      const url = await fetchBackupDownloadUrl(backupId);
      window.open(url, "_blank");
    } finally {
      setDownloadingId(null);
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
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={downloadingId === b.id}
                    onClick={() => handleDownload(b.id)}
                  >
                    {downloadingId === b.id ? "Downloading\u2026" : "Download"}
                  </Button>
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
