import { useQuery } from "@tanstack/react-query";
import { fetchDevice, fetchDeviceStatus, fetchDevices } from "../api/devices.js";
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

export function useDeviceStatus(
  id: string | undefined,
  options?: { refetchInterval?: number | false },
) {
  return useQuery({
    queryKey: queryKeys.deviceStatus(id!),
    queryFn: () => fetchDeviceStatus(id!),
    enabled: !!id,
    staleTime: 0,
    refetchInterval: options?.refetchInterval,
  });
}
