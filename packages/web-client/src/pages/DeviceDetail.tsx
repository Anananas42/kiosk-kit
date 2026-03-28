import { Card, CardContent, Spinner } from "@kioskkit/ui";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { BackupSection } from "../components/BackupSection.js";
import { ConnectionOverlay, OfflineIcon } from "../components/ConnectionOverlay.js";
import { DeviceStatusBadge } from "../components/DeviceStatusBadge.js";
import { OtaUpdateCard } from "../components/OtaUpdateCard.js";
import { StatusCard } from "../components/StatusCard.js";
import { useBackups } from "../hooks/backups.js";
import { useDevice, useDeviceStatus } from "../hooks/devices.js";
import { useTranslate } from "../hooks/useTranslate.js";
import { DeviceStatus, deriveDeviceStatus } from "../lib/device-status.js";
import { formatRelativeTime } from "../lib/format.js";

export function DeviceDetail() {
  const t = useTranslate();
  const { id } = useParams<{ id: string }>();
  const { data: device, isLoading, error } = useDevice(id);
  const { data: appResponding, isLoading: statusLoading } = useDeviceStatus(id);
  const { data: backups, error: backupError } = useBackups(id);
  const [iframeLoading, setIframeLoading] = useState(true);
  const [hasBeenReachable, setHasBeenReachable] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  const tailscaleOnline = device?.online ?? false;
  const status = deriveDeviceStatus(tailscaleOnline, appResponding);

  // When Tailscale comes online: mark reachable and remount iframe
  useEffect(() => {
    if (!tailscaleOnline) return;
    setHasBeenReachable(true);
    setIframeKey((k) => k + 1);
    setIframeLoading(true);
  }, [tailscaleOnline]);

  if (!id) return <p className="text-muted-foreground">{t("deviceDetail.missingId")}</p>;

  return (
    <div className="flex flex-1 flex-col gap-3" style={{ minHeight: 0 }}>
      {/* Breadcrumb + device info bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm">
          <nav className="text-muted-foreground">
            <Link to="/" className="hover:text-foreground underline-offset-4 hover:underline">
              {t("deviceDetail.breadcrumb.dashboard")}
            </Link>
            <span className="mx-2">/</span>
          </nav>
          {isLoading ? (
            <div className="bg-muted h-5 w-32 animate-pulse rounded" />
          ) : error ? (
            <span className="text-destructive">{t("deviceDetail.notFound")}</span>
          ) : (
            <span className="text-foreground font-medium">{device?.name}</span>
          )}
        </div>
        {!isLoading && !error && (
          <div className="flex items-center gap-2">
            {device?.lastSeen && status === DeviceStatus.Offline && (
              <span className="text-muted-foreground text-xs">
                {t("deviceDetail.lastSeen", { time: formatRelativeTime(device.lastSeen) })}
              </span>
            )}
            <DeviceStatusBadge status={status} loading={statusLoading && tailscaleOnline} />
          </div>
        )}
      </div>

      {/* Error state */}
      {!isLoading && error && (
        <StatusCard
          icon={
            <div className="bg-muted flex h-12 w-12 items-center justify-center rounded-full">
              <span className="text-muted-foreground text-xl">?</span>
            </div>
          }
          title={t("deviceDetail.notFoundDescription")}
          action={
            <Link to="/" className="text-sm text-primary hover:underline">
              {t("deviceDetail.backToDashboard")}
            </Link>
          }
        />
      )}

      {/* Loading state */}
      {isLoading && (
        <StatusCard
          icon={<Spinner className="h-4 w-4" />}
          title={t("deviceDetail.loadingDevice")}
        />
      )}

      {/* Offline — device was never reachable during this visit */}
      {!isLoading && !error && !hasBeenReachable && status === DeviceStatus.Offline && (
        <StatusCard
          icon={<OfflineIcon />}
          title={t("deviceDetail.offline.title")}
          description={t("deviceDetail.offline.description")}
          action={
            device?.lastSeen ? (
              <p className="text-muted-foreground text-xs">
                {t("deviceDetail.lastSeen", { time: formatRelativeTime(device.lastSeen) })}
              </p>
            ) : undefined
          }
        />
      )}

      {/* Iframe with connection overlay */}
      {!isLoading && !error && hasBeenReachable && (
        <Card className="flex flex-1 flex-col overflow-hidden" style={{ minHeight: 0 }}>
          <CardContent className="relative flex-1 p-0">
            {iframeLoading && (
              <div className="flex items-center gap-2 p-4">
                <Spinner className="h-4 w-4" />
                <span className="text-muted-foreground text-sm">
                  {t("deviceDetail.loadingManagement")}
                </span>
              </div>
            )}
            <iframe
              key={iframeKey}
              src={`/api/devices/${id}/kiosk/admin/`}
              title="Device Admin"
              onLoad={() => setIframeLoading(false)}
              className={`h-full w-full border-0 ${iframeLoading ? "hidden" : "block"}`}
            />
            {status === DeviceStatus.Offline && <ConnectionOverlay />}
          </CardContent>
        </Card>
      )}

      {/* OTA update card — only when device is online */}
      {!isLoading && !error && status === DeviceStatus.Online && id && (
        <OtaUpdateCard deviceId={id} />
      )}

      {/* Backups section */}
      {!isLoading &&
        !error &&
        (backupError ? (
          <Card>
            <CardContent>
              <p className="text-destructive">
                {t("deviceDetail.backupError", { error: backupError.message })}
              </p>
            </CardContent>
          </Card>
        ) : (
          <BackupSection
            backups={backups ?? []}
            deviceName={device?.name}
            deviceOnline={appResponding ?? undefined}
          />
        ))}
    </div>
  );
}
