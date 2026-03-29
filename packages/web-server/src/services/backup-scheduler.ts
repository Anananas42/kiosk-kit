import { BACKUP_POLL_INTERVAL_MS } from "../config.js";
import type { Db } from "../db/index.js";
import { pullBackupsFromDueDevices } from "../routes/backup-upload.js";

/**
 * Start a backup scheduler that polls for devices due for backup.
 * Only call this when S3 and Tailscale are configured.
 */
export function startBackupScheduler(db: Db): void {
  const run = () => {
    pullBackupsFromDueDevices(db).catch((err) => {
      console.error(
        "[backup-scheduler] Unexpected error:",
        err instanceof Error ? err.message : err,
      );
    });
  };

  setTimeout(run, 0);
  setInterval(run, BACKUP_POLL_INTERVAL_MS);
  console.log("[backup-scheduler] Polling for due backups every hour");
}
