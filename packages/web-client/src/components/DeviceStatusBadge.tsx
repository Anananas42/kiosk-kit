import { DeviceStatus } from "@kioskkit/shared";
import { Badge, Spinner } from "@kioskkit/ui";
import type { MessageKey } from "../hooks/useTranslate.js";
import { useTranslate } from "../hooks/useTranslate.js";

const config: Record<
  DeviceStatus,
  { labelKey: MessageKey; dotClass: string; variant: "default" | "secondary" | "destructive" }
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
  error,
}: {
  status: DeviceStatus | undefined;
  loading?: boolean;
  error?: Error | null;
}) {
  const t = useTranslate();

  if (loading && !status) {
    return (
      <Badge variant="secondary">
        <Spinner />
      </Badge>
    );
  }

  if (error && !status) {
    return (
      <Badge variant="destructive">
        <span className="inline-block h-2 w-2 rounded-full bg-destructive-foreground" />
        {t("deviceStatus.error")}
      </Badge>
    );
  }

  if (!status) return null;

  const { labelKey, dotClass, variant } = config[status];
  return (
    <Badge variant={variant}>
      {loading ? <Spinner /> : <span className={`inline-block h-2 w-2 rounded-full ${dotClass}`} />}
      {t(labelKey)}
    </Badge>
  );
}
