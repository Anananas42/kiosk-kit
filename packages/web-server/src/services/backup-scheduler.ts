import { BACKUP_INTERVAL_MS } from "../config.js";
import type { Db } from "../db/index.js";
import { pullBackupsFromAllDevices } from "../routes/backup-upload.js";

/**
 * Start a daily backup scheduler that pulls backups from all known devices.
 * Only call this when S3 and Tailscale are configured.
 */
export function startBackupScheduler(db: Db): void {
  const run = () => {
    pullBackupsFromAllDevices(db).catch((err) => {
      console.error(
        "[backup-scheduler] Unexpected error:",
        err instanceof Error ? err.message : err,
      );
    });
  };

  setInterval(run, BACKUP_INTERVAL_MS);
  console.log("[backup-scheduler] Scheduled daily backup pulls for all devices");
}
