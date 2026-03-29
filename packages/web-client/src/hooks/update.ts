import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchDeviceUpdateStatus,
  fetchServerUpdateStatus,
  fetchUpdateInfo,
  triggerUpdateCancel,
  triggerUpdateInstall,
  triggerUpdatePush,
} from "../api/update.js";
import { PollInterval } from "../constants.js";
import { queryKeys } from "./query-keys.js";

export function useUpdateInfoQuery(deviceId: string) {
  return useQuery({
    queryKey: queryKeys.updateInfo(deviceId),
    queryFn: () => fetchUpdateInfo(deviceId),
  });
}

export function useDeviceUpdateStatusQuery(
  deviceId: string,
  options?: { refetchInterval?: number | false },
) {
  return useQuery({
    queryKey: queryKeys.deviceUpdateStatus(deviceId),
    queryFn: () => fetchDeviceUpdateStatus(deviceId),
    refetchInterval: options?.refetchInterval ?? false,
  });
}

export function useServerUpdateStatusQuery(deviceId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.serverUpdateStatus(deviceId),
    queryFn: () => fetchServerUpdateStatus(deviceId),
    enabled,
    refetchInterval: enabled ? PollInterval.ServerStatus : false,
  });
}

export function useUpdatePushMutation(deviceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => triggerUpdatePush(deviceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.deviceUpdateStatus(deviceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.updateInfo(deviceId) });
    },
  });
}

export function useUpdateInstallMutation(deviceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => triggerUpdateInstall(deviceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.deviceUpdateStatus(deviceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.serverUpdateStatus(deviceId) });
    },
  });
}

export function useUpdateCancelMutation(deviceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => triggerUpdateCancel(deviceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.deviceUpdateStatus(deviceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.serverUpdateStatus(deviceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.updateInfo(deviceId) });
    },
  });
}
