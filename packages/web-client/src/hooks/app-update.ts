import type { AppUpdateStatus } from "@kioskkit/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  cancelAppDownload,
  fetchAppUpdateStatus,
  fetchLatestAppRelease,
  triggerAppDownload,
  triggerAppInstall,
  triggerAppRollback,
} from "../api/app-update.js";
import { queryClient } from "../queryClient.js";
import { queryKeys } from "./query-keys.js";

export function useLatestAppRelease() {
  return useQuery({
    queryKey: queryKeys.latestAppRelease,
    queryFn: fetchLatestAppRelease,
  });
}

export function useAppUpdateStatus(
  deviceId: string,
  options?: {
    refetchInterval?:
      | number
      | false
      | ((query: { state: { data: AppUpdateStatus | null | undefined } }) => number | false);
  },
) {
  return useQuery({
    queryKey: queryKeys.appUpdateStatus(deviceId),
    queryFn: () => fetchAppUpdateStatus(deviceId),
    refetchInterval: options?.refetchInterval as number | false | undefined,
  });
}

export function useAppDownload(deviceId: string) {
  return useMutation({
    mutationFn: (version: string) => triggerAppDownload(deviceId, version),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.appUpdateStatus(deviceId) });
    },
  });
}

export function useAppInstall(deviceId: string) {
  return useMutation({
    mutationFn: () => triggerAppInstall(deviceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.appUpdateStatus(deviceId) });
    },
  });
}

export function useAppRollback(deviceId: string) {
  return useMutation({
    mutationFn: () => triggerAppRollback(deviceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.appUpdateStatus(deviceId) });
    },
  });
}

export function useAppCancelDownload(deviceId: string) {
  return useMutation({
    mutationFn: () => cancelAppDownload(deviceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.appUpdateStatus(deviceId) });
    },
  });
}
