import { Card, CardContent } from "@kioskkit/ui";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { BackupSection } from "../components/BackupSection.js";
import { DeviceStatusBadge } from "../components/DeviceStatusBadge.js";
import { OtaUpdateCard } from "../components/OtaUpdateCard.js";
import { useBackups } from "../hooks/backups.js";
import { useDevice, useDeviceStatus } from "../hooks/devices.js";
import { deriveDeviceStatus } from "../lib/device-status.js";
import { formatRelativeTime } from "../lib/format.js";

export function DeviceDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: device, isLoading, error } = useDevice(id);
  const { data: appResponding } = useDeviceStatus(id);
  const { data: backups, error: backupError } = useBackups(id);
  const [iframeLoading, setIframeLoading] = useState(true);

  if (!id) return <p className="text-muted-foreground">Missing device ID.</p>;

  const status = deriveDeviceStatus(device?.online ?? false, appResponding);

  return (
    <div className="flex flex-1 flex-col gap-3" style={{ minHeight: 0 }}>
      {/* Breadcrumb + device info bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm">
          <nav className="text-muted-foreground">
            <Link to="/" className="hover:text-foreground underline-offset-4 hover:underline">
              Dashboard
            </Link>
            <span className="mx-2">/</span>
          </nav>
          {isLoading ? (
            <div className="bg-muted h-5 w-32 animate-pulse rounded" />
          ) : error ? (
            <span className="text-destructive">Device not found</span>
          ) : (
            <span className="text-foreground font-medium">{device?.name}</span>
          )}
        </div>
        {!isLoading && !error && status !== null && (
          <div className="flex items-center gap-2">
            {device?.lastSeen && status === "offline" && (
              <span className="text-muted-foreground text-xs">
                Last seen {formatRelativeTime(device.lastSeen)}
              </span>
            )}
            <DeviceStatusBadge status={status} />
          </div>
        )}
      </div>

      {/* Error state */}
      {!isLoading && error && (
        <Card className="flex flex-1 items-center justify-center">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="bg-muted flex h-12 w-12 items-center justify-center rounded-full">
              <span className="text-muted-foreground text-xl">?</span>
            </div>
            <p className="text-muted-foreground">
              This device could not be found. It may have been removed.
            </p>
            <Link to="/" className="text-sm text-primary hover:underline">
              Back to Dashboard
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Offline / App Not Connected state */}
      {!isLoading && !error && (status === "offline" || status === "app-not-connected") && (
        <Card className="flex flex-1 items-center justify-center">
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="bg-muted flex h-14 w-14 items-center justify-center rounded-full">
              <svg
                className="text-muted-foreground h-7 w-7"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                role="img"
                aria-label="Disconnected"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d={
                    status === "offline"
                      ? "M3 3l18 18M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0"
                      : "M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                  }
                />
              </svg>
            </div>
            <div>
              <p className="text-foreground font-medium">
                {status === "offline" ? "Device is offline" : "App not connected"}
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                {status === "offline"
                  ? "The management interface is available when the device is connected to the network."
                  : "The device is on the network but the kiosk app is not responding."}
              </p>
              {device?.lastSeen && status === "offline" && (
                <p className="text-muted-foreground mt-2 text-xs">
                  Last seen {formatRelativeTime(device.lastSeen)}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading state */}
      {isLoading && (
        <Card className="flex flex-1 items-center justify-center">
          <CardContent className="flex items-center gap-2 py-16">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <span className="text-muted-foreground text-sm">Loading device…</span>
          </CardContent>
        </Card>
      )}

      {/* Iframe for online device */}
      {!isLoading && !error && status === "online" && (
        <Card className="flex flex-1 flex-col overflow-hidden" style={{ minHeight: 0 }}>
          <CardContent className="relative flex-1 p-0">
            {iframeLoading && (
              <div className="flex items-center gap-2 p-4">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                <span className="text-muted-foreground text-sm">Loading device management…</span>
              </div>
            )}
            <iframe
              src={`/api/devices/${id}/kiosk/admin/`}
              title="Device Admin"
              onLoad={() => setIframeLoading(false)}
              className={`h-full w-full border-0 ${iframeLoading ? "hidden" : "block"}`}
            />
          </CardContent>
        </Card>
      )}

      {/* OTA update card — only when device is online */}
      {!isLoading && !error && status === "online" && id && <OtaUpdateCard deviceId={id} />}

      {/* Backups section */}
      {!isLoading &&
        !error &&
        (backupError ? (
          <Card>
            <CardContent>
              <p className="text-destructive">Failed to load backups: {backupError.message}</p>
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
