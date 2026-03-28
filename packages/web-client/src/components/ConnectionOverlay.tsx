import { useTranslate } from "../hooks/useTranslate.js";
import { DeviceStatus } from "../lib/device-status.js";
import { DeviceStatusBadge } from "./DeviceStatusBadge.js";

type DisconnectedStatus = DeviceStatus.Offline | DeviceStatus.AppNotConnected;

const ICON_PATH: Record<DisconnectedStatus, string> = {
  [DeviceStatus.Offline]:
    "M3 3l18 18M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0",
  [DeviceStatus.AppNotConnected]:
    "M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z",
};

const MESSAGE_KEY = {
  [DeviceStatus.Offline]: "deviceDetail.overlay.offline",
  [DeviceStatus.AppNotConnected]: "deviceDetail.overlay.appNotConnected",
} as const;

export function DisconnectedIcon({ status }: { status: DisconnectedStatus }) {
  return (
    <div className="bg-muted flex h-14 w-14 items-center justify-center rounded-full">
      <svg
        className="text-muted-foreground h-7 w-7"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
        role="img"
        aria-label={status === DeviceStatus.Offline ? "Offline" : "App not connected"}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATH[status]} />
      </svg>
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
