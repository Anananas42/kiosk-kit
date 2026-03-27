import { Badge } from "@kioskkit/ui";
import { DeviceStatus } from "../lib/device-status.js";

const config: Record<
  DeviceStatus,
  { label: string; dotClass: string; variant: "default" | "secondary" }
> = {
  [DeviceStatus.Online]: { label: "Online", dotClass: "bg-green-500", variant: "default" },
  [DeviceStatus.AppNotConnected]: {
    label: "App Not Connected",
    dotClass: "bg-orange-400",
    variant: "secondary",
  },
  [DeviceStatus.Offline]: {
    label: "Offline",
    dotClass: "bg-muted-foreground",
    variant: "secondary",
  },
};

export function DeviceStatusBadge({ status }: { status: DeviceStatus }) {
  const { label, dotClass, variant } = config[status];
  return (
    <Badge variant={variant} className="flex w-fit items-center gap-1.5">
      <span className={`inline-block h-2 w-2 rounded-full ${dotClass}`} />
      {label}
    </Badge>
  );
}
