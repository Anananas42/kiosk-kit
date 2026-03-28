import { Badge, Spinner } from "@kioskkit/ui";
import type { MessageKey } from "../hooks/useTranslate.js";
import { useTranslate } from "../hooks/useTranslate.js";
import { DeviceStatus } from "../lib/device-status.js";

const config: Record<
  DeviceStatus,
  { labelKey: MessageKey; dotClass: string; variant: "default" | "secondary" }
> = {
  [DeviceStatus.Online]: {
    labelKey: "deviceStatus.online",
    dotClass: "bg-green-500",
    variant: "default",
  },
  [DeviceStatus.AppNotConnected]: {
    labelKey: "deviceStatus.appNotConnected",
    dotClass: "bg-orange-400",
    variant: "secondary",
  },
  [DeviceStatus.Offline]: {
    labelKey: "deviceStatus.offline",
    dotClass: "bg-muted-foreground",
    variant: "secondary",
  },
};

export function DeviceStatusBadge({
  status,
  loading,
}: {
  status: DeviceStatus;
  loading?: boolean;
}) {
  const t = useTranslate();
  const { labelKey, dotClass, variant } = config[status];
  return (
    <Badge variant={variant}>
      {loading ? <Spinner /> : <span className={`inline-block h-2 w-2 rounded-full ${dotClass}`} />}
      {t(labelKey)}
    </Badge>
  );
}
