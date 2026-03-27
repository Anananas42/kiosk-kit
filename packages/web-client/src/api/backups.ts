import { trpc } from "../trpc.js";

export async function fetchBackups(
  deviceId: string,
): Promise<{ id: string; sizeBytes: number; createdAt: string }[]> {
  return trpc["backups.list"].query({ deviceId });
}

export async function fetchBackupDownloadUrl(backupId: string): Promise<string> {
  const { url } = await trpc["backups.getDownloadUrl"].query({ backupId });
  return url;
}

export async function restoreBackup(backupId: string): Promise<void> {
  await trpc["backups.restore"].mutate({ backupId });
}
