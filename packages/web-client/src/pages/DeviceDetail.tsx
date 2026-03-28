import { Card, CardContent, Skeleton, Spinner } from "@kioskkit/ui";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { BackupSection } from "../components/BackupSection.js";
import { ConnectionOverlay, DisconnectedIcon } from "../components/ConnectionOverlay.js";
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
  const [hasBeenOnline, setHasBeenOnline] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  const status = deriveDeviceStatus(device?.online ?? false, appResponding);

  // When status transitions to Online: mark as been-online and remount iframe
  useEffect(() => {
    if (status !== DeviceStatus.Online) return;
    setHasBeenOnline(true);
    setIframeKey((k) => k + 1);
    setIframeLoading(true);
  }, [status]);

  if (!id) return <p className="text-muted-foreground">{t("deviceDetail.missingId")}</p>;

  const isDisconnected = status === DeviceStatus.Offline || status === DeviceStatus.AppNotConnected;

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
            <DeviceStatusBadge
              status={status}
              loading={statusLoading && (device?.online ?? false)}
            />
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
        <Card className="flex min-h-[400px] flex-1 flex-col overflow-hidden">
          <CardContent className="flex-1 p-0">
            <Skeleton className="h-full w-full rounded-none" />
          </CardContent>
        </Card>
      )}

      {/* Disconnected — device was never online during this visit */}
      {!isLoading && !error && !hasBeenOnline && isDisconnected && (
        <StatusCard
          icon={
            <DisconnectedIcon
              status={status as DeviceStatus.Offline | DeviceStatus.AppNotConnected}
            />
          }
          title={
            status === DeviceStatus.Offline
              ? t("deviceDetail.offline.title")
              : t("deviceDetail.appNotConnected.title")
          }
          description={
            status === DeviceStatus.Offline
              ? t("deviceDetail.offline.description")
              : t("deviceDetail.appNotConnected.description")
          }
          action={
            device?.lastSeen && status === DeviceStatus.Offline ? (
              <p className="text-muted-foreground text-xs">
                {t("deviceDetail.lastSeen", { time: formatRelativeTime(device.lastSeen) })}
              </p>
            ) : undefined
          }
        />
      )}

      {/* Iframe with connection overlay */}
      {!isLoading && !error && hasBeenOnline && (
        <Card className="flex min-h-[400px] flex-1 flex-col overflow-hidden">
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
            {isDisconnected && (
              <ConnectionOverlay
                status={status as DeviceStatus.Offline | DeviceStatus.AppNotConnected}
              />
            )}
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
