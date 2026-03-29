import {
  type DeviceUpdateInfo,
  type UpdateOp,
  UpdateResult,
  type UpdateStatus,
  UpdateStep,
  type UpdateType,
} from "@kioskkit/shared";
import { useMemo, useRef } from "react";
import { PollInterval } from "../constants.js";
import {
  useDeviceUpdateStatusQuery,
  useServerUpdateStatusQuery,
  useUpdateCancelMutation,
  useUpdateInfoQuery,
  useUpdateInstallMutation,
  useUpdatePushMutation,
} from "./update.js";

export enum CardState {
  UpToDate = "up-to-date",
  UpdateAvailable = "update-available",
  Downloading = "downloading",
  Downloaded = "downloaded",
  Installing = "installing",
  Success = "success",
  Failed = "failed",
}

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
  serverOp: UpdateOp | null,
  updateInfo: DeviceUpdateInfo | undefined,
): DerivedUpdate {
  const currentVersion = deviceStatus?.currentVersion ?? updateInfo?.currentVersion ?? null;
  const infoType: UpdateType | null =
    updateInfo?.type === "full" || updateInfo?.type === "live" ? updateInfo.type : null;

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
    const opType = serverOp.updateType;
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

function getPollInterval(status: UpdateStep | undefined): number | false {
  if (status === UpdateStep.Uploading) return PollInterval.Uploading;
  if (status === UpdateStep.Installing) return PollInterval.Installing;
  return false;
}

export function useUpdateCardState(deviceId: string) {
  const lastStatusRef = useRef<UpdateStep | undefined>(undefined);

  const updateInfo = useUpdateInfoQuery(deviceId);
  const deviceUpdateStatus = useDeviceUpdateStatusQuery(deviceId, {
    refetchInterval: getPollInterval(lastStatusRef.current),
  });

  lastStatusRef.current = deviceUpdateStatus.data?.status;

  const serverUpdateStatus = useServerUpdateStatusQuery(deviceId, !!deviceUpdateStatus.error);

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

  const push = useUpdatePushMutation(deviceId);
  const install = useUpdateInstallMutation(deviceId);
  const cancel = useUpdateCancelMutation(deviceId);

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
