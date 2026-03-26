import { Badge, Card, CardContent } from "@kioskkit/ui";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { type Device, fetchDevice, fetchDeviceStatus } from "./api.js";

function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

export function DeviceDetail() {
  const { id } = useParams<{ id: string }>();
  const [device, setDevice] = useState<Device | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reachable, setReachable] = useState<boolean | null>(null);
  const [iframeLoading, setIframeLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetchDevice(id)
      .then(async (d) => {
        setDevice(d);
        const isReachable = await fetchDeviceStatus(id);
        setReachable(isReachable);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id]);

  if (!id) return <p className="text-muted-foreground">Missing device ID.</p>;

  const online = reachable;

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
          {loading ? (
            <div className="bg-muted h-5 w-32 animate-pulse rounded" />
          ) : error ? (
            <span className="text-destructive">Device not found</span>
          ) : (
            <span className="text-foreground font-medium">{device?.name}</span>
          )}
        </div>
        {!loading && !error && online !== null && (
          <div className="flex items-center gap-2">
            {device?.lastSeen && !online && (
              <span className="text-muted-foreground text-xs">
                Last seen {formatRelativeTime(device.lastSeen)}
              </span>
            )}
            <Badge variant={online ? "default" : "secondary"} className="flex items-center gap-1.5">
              <span
                className={`inline-block h-2 w-2 rounded-full ${online ? "bg-green-500" : "bg-muted-foreground"}`}
              />
              {online ? "Online" : "Offline"}
            </Badge>
          </div>
        )}
      </div>

      {/* Error state */}
      {!loading && error && (
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

      {/* Offline state */}
      {!loading && !error && online === false && (
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
                  d="M3 3l18 18M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0"
                />
              </svg>
            </div>
            <div>
              <p className="text-foreground font-medium">Device is offline</p>
              <p className="text-muted-foreground mt-1 text-sm">
                The management interface is available when the device is connected to the network.
              </p>
              {device?.lastSeen && (
                <p className="text-muted-foreground mt-2 text-xs">
                  Last seen {formatRelativeTime(device.lastSeen)}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading state */}
      {loading && (
        <Card className="flex flex-1 items-center justify-center">
          <CardContent className="flex items-center gap-2 py-16">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <span className="text-muted-foreground text-sm">Loading device…</span>
          </CardContent>
        </Card>
      )}

      {/* Iframe for online device */}
      {!loading && !error && online && (
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
    </div>
  );
}
