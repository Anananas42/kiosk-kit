import { useTranslate } from "../hooks/useTranslate.js";
import { DeviceStatus } from "../lib/device-status.js";
import { DeviceStatusBadge } from "./DeviceStatusBadge.js";

const WIFI_OFF_PATH =
  "M3 3l18 18M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0";

export function OfflineIcon() {
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
        aria-label="Offline"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d={WIFI_OFF_PATH} />
      </svg>
    </div>
  );
}

export function ConnectionOverlay() {
  const t = useTranslate();

  return (
    <div className="bg-background/80 absolute inset-0 flex flex-col items-center justify-center gap-3 backdrop-blur-sm">
      <OfflineIcon />
      <p className="text-foreground font-medium">{t("deviceDetail.overlay.offline")}</p>
      <DeviceStatusBadge status={DeviceStatus.Offline} />
    </div>
  );
}
