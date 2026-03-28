import { useMutation, useQuery } from "@tanstack/react-query";
import {
  claimDevice,
  fetchDevice,
  fetchDeviceStatus,
  fetchDevices,
  renameDevice,
} from "../api/devices.js";
import { queryClient } from "../queryClient.js";
import { queryKeys } from "./query-keys.js";

export function useDevices() {
  return useQuery({
    queryKey: queryKeys.devices,
    queryFn: fetchDevices,
  });
}

export function useDevice(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.device(id!),
    queryFn: () => fetchDevice(id!),
    enabled: !!id,
  });
}

export function useClaimDevice() {
  return useMutation({
    mutationFn: (code: string) => claimDevice(code),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.devices });
    },
  });
}

export function useRenameDevice() {
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameDevice(id, name),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.device(variables.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.devices });
    },
  });
}

export function useDeviceStatus(
  id: string | undefined,
  options?: { refetchInterval?: number | false },
) {
  return useQuery({
    queryKey: queryKeys.deviceStatus(id!),
    queryFn: () => fetchDeviceStatus(id!),
    enabled: !!id,
    staleTime: 0,
    refetchInterval: options?.refetchInterval ?? 5_000,
  });
}
