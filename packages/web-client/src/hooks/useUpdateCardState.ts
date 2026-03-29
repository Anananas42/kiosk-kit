import {
  type DeviceUpdateInfo,
  UpdateResult,
  type UpdateStatus,
  UpdateStep,
} from "@kioskkit/shared";
import { useMemo, useRef } from "react";
import type { ServerUpdateOp } from "../api/update.js";
import {
  useDeviceUpdateStatus,
  useServerUpdateStatus,
  useUpdateCancel,
  useUpdateInfo,
  useUpdateInstall,
  useUpdatePush,
} from "./update.js";

// ---------------------------------------------------------------------------
// State derivation (pure, exported for testing)
// ---------------------------------------------------------------------------

export enum CardState {
  UpToDate = "up-to-date",
  UpdateAvailable = "update-available",
  Downloading = "downloading",
  Downloaded = "downloaded",
  Installing = "installing",
  Success = "success",
  Failed = "failed",
}

export type UpdateType = "live" | "full";

export interface DerivedUpdate {
  state: CardState;
  type: UpdateType | null;
  targetVersion: string | null;
  currentVersion: string | null;
}

/**
 * Derives the card display state from three data sources:
 *   1. Device status (primary — real-time from the device)
 *   2. Server operation (fallback — when device is unreachable)
 *   3. Update info (what update is available, from the server DB)
 */
export function deriveUpdate(
  deviceStatus: UpdateStatus | undefined,
  deviceError: boolean,
  serverOp: ServerUpdateOp | null,
  updateInfo: DeviceUpdateInfo | undefined,
): DerivedUpdate {
  const currentVersion = deviceStatus?.currentVersion ?? updateInfo?.currentVersion ?? null;
  const infoType: UpdateType | null =
    updateInfo?.type === "live" || updateInfo?.type === "full" ? updateInfo.type : null;

  // Primary: device is reachable
  if (deviceStatus) {
    switch (deviceStatus.status) {
      case UpdateStep.Uploading:
        return {
          state: CardState.Downloading,
          type: infoType,
          targetVersion: deviceStatus.upload?.version ?? null,
          currentVersion,
        };
      case UpdateStep.Downloaded:
        return {
          state: CardState.Downloaded,
          type: infoType,
          targetVersion: deviceStatus.upload?.version ?? null,
          currentVersion,
        };
      case UpdateStep.Installing:
        return { state: CardState.Installing, type: infoType, targetVersion: null, currentVersion };
      case UpdateStep.RollingBack:
        return { state: CardState.Failed, type: infoType, targetVersion: null, currentVersion };
      case UpdateStep.Idle: {
        if (deviceStatus.lastResult === UpdateResult.Success)
          return { state: CardState.Success, type: infoType, targetVersion: null, currentVersion };
        if (deviceStatus.lastResult !== null)
          return { state: CardState.Failed, type: infoType, targetVersion: null, currentVersion };
        break; // fall through to update-available check
      }
    }
  }

  // Fallback: device unreachable but server shows an active operation
  if (deviceError && serverOp) {
    const opType: UpdateType = serverOp.updateType === "live" ? "live" : "full";
    const fallbackState =
      serverOp.action === "install" ? CardState.Installing : CardState.Downloading;
    return { state: fallbackState, type: opType, targetVersion: serverOp.version, currentVersion };
  }

  // Update available from server info
  if (infoType) {
    return {
      state: CardState.UpdateAvailable,
      type: infoType,
      targetVersion: updateInfo?.targetVersion ?? null,
      currentVersion,
    };
  }

  return { state: CardState.UpToDate, type: null, targetVersion: null, currentVersion };
}

// ---------------------------------------------------------------------------
// Polling interval config
// ---------------------------------------------------------------------------

const POLL_INTERVALS: Partial<Record<UpdateStep, number>> = {
  [UpdateStep.Uploading]: 3000,
  [UpdateStep.Installing]: 5000,
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useUpdateCardState(deviceId: string) {
  // Track the last-known device status to compute poll interval.
  // On first render lastStatus is undefined → no polling.
  // After data arrives, re-render uses the updated ref for the next interval.
  const lastStatusRef = useRef<UpdateStep | undefined>(undefined);

  const updateInfo = useUpdateInfo(deviceId);
  const deviceUpdateStatus = useDeviceUpdateStatus(deviceId, {
    refetchInterval: POLL_INTERVALS[lastStatusRef.current!] ?? false,
  });

  // Update the ref after the hook call so next render uses the latest status.
  lastStatusRef.current = deviceUpdateStatus.data?.status;

  const serverUpdateStatus = useServerUpdateStatus(deviceId, !!deviceUpdateStatus.error);

  const derived = useMemo(
    () =>
      deriveUpdate(
        deviceUpdateStatus.data,
        !!deviceUpdateStatus.error,
        serverUpdateStatus.data?.operation ?? null,
        updateInfo.data,
      ),
    [
      deviceUpdateStatus.data,
      deviceUpdateStatus.error,
      serverUpdateStatus.data?.operation,
      updateInfo.data,
    ],
  );

  const push = useUpdatePush(deviceId);
  const install = useUpdateInstall(deviceId);
  const cancel = useUpdateCancel(deviceId);

  return {
    derived,
    updateInfo: updateInfo.data,
    deviceStatus: deviceUpdateStatus.data,
    isLoading: updateInfo.isLoading || deviceUpdateStatus.isLoading,
    hasData: !!(updateInfo.data || deviceUpdateStatus.data),
    push,
    install,
    cancel,
    actionLoading: push.isPending || install.isPending || cancel.isPending,
  };
}
