import type { OtaStatus } from "@kioskkit/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  cancelOtaDownload,
  fetchLatestRelease,
  fetchOtaStatus,
  triggerOtaDownload,
  triggerOtaInstall,
  triggerOtaRollback,
} from "../api/ota.js";
import { queryClient } from "../queryClient.js";
import { queryKeys } from "./query-keys.js";

export function useLatestRelease() {
  return useQuery({
    queryKey: queryKeys.latestRelease,
    queryFn: fetchLatestRelease,
  });
}

export function useOtaStatus(
  deviceId: string,
  options?: {
    refetchInterval?:
      | number
      | false
      | ((query: { state: { data: OtaStatus | undefined } }) => number | false);
  },
) {
  return useQuery({
    queryKey: queryKeys.otaStatus(deviceId),
    queryFn: () => fetchOtaStatus(deviceId),
    refetchInterval: options?.refetchInterval as number | false | undefined,
  });
}

export function useOtaDownload(deviceId: string) {
  return useMutation({
    mutationFn: (version: string) => triggerOtaDownload(deviceId, version),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.otaStatus(deviceId) });
    },
  });
}

export function useOtaInstall(deviceId: string) {
  return useMutation({
    mutationFn: () => triggerOtaInstall(deviceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.otaStatus(deviceId) });
    },
  });
}

export function useOtaRollback(deviceId: string) {
  return useMutation({
    mutationFn: () => triggerOtaRollback(deviceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.otaStatus(deviceId) });
    },
  });
}

export function useOtaCancelDownload(deviceId: string) {
  return useMutation({
    mutationFn: () => cancelOtaDownload(deviceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.otaStatus(deviceId) });
    },
  });
}
