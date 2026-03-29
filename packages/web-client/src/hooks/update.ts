import type { UpdateStatus } from "@kioskkit/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  fetchDeviceUpdateStatus,
  fetchServerUpdateStatus,
  fetchUpdateInfo,
  triggerUpdateCancel,
  triggerUpdateInstall,
  triggerUpdatePush,
} from "../api/update.js";
import { queryClient } from "../queryClient.js";
import { queryKeys } from "./query-keys.js";

export function useUpdateInfo(deviceId: string) {
  return useQuery({
    queryKey: queryKeys.updateInfo(deviceId),
    queryFn: () => fetchUpdateInfo(deviceId),
  });
}

export function useDeviceUpdateStatus(
  deviceId: string,
  options?: {
    refetchInterval?:
      | number
      | false
      | ((query: { state: { data: UpdateStatus | undefined } }) => number | false);
  },
) {
  return useQuery({
    queryKey: queryKeys.deviceUpdateStatus(deviceId),
    queryFn: () => fetchDeviceUpdateStatus(deviceId),
    refetchInterval: options?.refetchInterval as number | false | undefined,
  });
}

export function useServerUpdateStatus(deviceId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.serverUpdateStatus(deviceId),
    queryFn: () => fetchServerUpdateStatus(deviceId),
    enabled,
    refetchInterval: enabled ? 5000 : false,
  });
}

export function useUpdatePush(deviceId: string) {
  return useMutation({
    mutationFn: () => triggerUpdatePush(deviceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.deviceUpdateStatus(deviceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.updateInfo(deviceId) });
    },
  });
}

export function useUpdateInstall(deviceId: string) {
  return useMutation({
    mutationFn: () => triggerUpdateInstall(deviceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.deviceUpdateStatus(deviceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.serverUpdateStatus(deviceId) });
    },
  });
}

export function useUpdateCancel(deviceId: string) {
  return useMutation({
    mutationFn: () => triggerUpdateCancel(deviceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.deviceUpdateStatus(deviceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.serverUpdateStatus(deviceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.updateInfo(deviceId) });
    },
  });
}
