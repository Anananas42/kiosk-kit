import { useMutation, useQuery } from "@tanstack/react-query";
import { fetchBackupDownloadUrl, fetchBackups, restoreBackup } from "../api/backups.js";
import { queryClient } from "../queryClient.js";
import { queryKeys } from "./query-keys.js";

export function useBackups(deviceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.backups(deviceId!),
    queryFn: () => fetchBackups(deviceId!),
    enabled: !!deviceId,
  });
}

export function useRestoreBackup(deviceId: string) {
  return useMutation({
    mutationFn: restoreBackup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.backups(deviceId) });
    },
  });
}

export function useBackupDownload() {
  return useMutation({
    mutationFn: async (backupId: string) => {
      const url = await fetchBackupDownloadUrl(backupId);
      window.open(url, "_blank");
    },
  });
}
