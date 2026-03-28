import { DeviceStatus } from "@kioskkit/shared";
import type { IconType } from "react-icons";
import { MdErrorOutline, MdWifiOff } from "react-icons/md";
import { useTranslate } from "../hooks/useTranslate.js";
import { DeviceStatusBadge } from "./DeviceStatusBadge.js";

type DisconnectedStatus = DeviceStatus.Offline | DeviceStatus.AppNotConnected;

const ICON: Record<DisconnectedStatus, IconType> = {
  [DeviceStatus.Offline]: MdWifiOff,
  [DeviceStatus.AppNotConnected]: MdErrorOutline,
};

const MESSAGE_KEY = {
  [DeviceStatus.Offline]: "deviceDetail.overlay.offline",
  [DeviceStatus.AppNotConnected]: "deviceDetail.overlay.appNotConnected",
} as const;

export function DisconnectedIcon({ status }: { status: DisconnectedStatus }) {
  const Icon = ICON[status];
  return (
    <div className="bg-muted flex h-14 w-14 items-center justify-center rounded-full">
      <Icon className="text-muted-foreground h-7 w-7" />
    </div>
  );
}

export function ConnectionOverlay({ status }: { status: DisconnectedStatus }) {
  const t = useTranslate();

  return (
    <div className="bg-background/80 absolute inset-0 flex flex-col items-center justify-center gap-3 backdrop-blur-sm">
      <DisconnectedIcon status={status} />
      <p className="text-foreground font-medium">{t(MESSAGE_KEY[status])}</p>
      <DeviceStatusBadge status={status} />
    </div>
  );
}
