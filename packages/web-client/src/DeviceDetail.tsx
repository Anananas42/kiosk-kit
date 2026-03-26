import { Badge, Card, CardContent, CardHeader, CardTitle } from "@kioskkit/ui";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { type Device, fetchDevice } from "./api.js";

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
  const [iframeLoading, setIframeLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetchDevice(id)
      .then(setDevice)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (!id) return <p className="text-muted-foreground">Missing device ID.</p>;

  const online = device?.online ?? null;

  return (
    <div className="flex flex-1 flex-col gap-4" style={{ minHeight: 0 }}>
      {/* Breadcrumb */}
      <nav className="text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground underline-offset-4 hover:underline">
          Dashboard
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{device?.name ?? "..."}</span>
      </nav>

      {/* Device metadata header */}
      <Card>
        <CardHeader className="flex flex-col gap-2">
          {loading ? (
            <div className="flex flex-col gap-2">
              <div className="bg-muted h-7 w-48 animate-pulse rounded" />
              <div className="bg-muted h-4 w-32 animate-pulse rounded" />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-4">
                <CardTitle className="text-2xl">{device?.name}</CardTitle>
                {online !== null &&
                  (online ? (
                    <Badge variant="default" className="flex items-center gap-1.5">
                      <span className="bg-green-500 inline-block h-2 w-2 rounded-full" />
                      Online
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="flex items-center gap-1.5">
                      <span className="bg-muted-foreground inline-block h-2 w-2 rounded-full" />
                      Offline
                    </Badge>
                  ))}
              </div>
              {device?.lastSeen && (
                <p className="text-sm text-muted-foreground">
                  Last seen {formatRelativeTime(device.lastSeen)}
                </p>
              )}
            </>
          )}
        </CardHeader>
      </Card>

      {/* Iframe or offline state */}
      {!loading && online === false && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-muted-foreground text-lg">Device is offline.</p>
            {device?.lastSeen && (
              <p className="text-muted-foreground mt-1 text-sm">
                Last seen {formatRelativeTime(device.lastSeen)}.
              </p>
            )}
            <p className="text-muted-foreground mt-3 text-sm">
              Management is available when the device is connected.
            </p>
          </CardContent>
        </Card>
      )}

      {online && (
        <Card className="flex flex-1 flex-col overflow-hidden" style={{ minHeight: 0 }}>
          <CardContent className="relative flex-1 p-0">
            {iframeLoading && (
              <div className="flex items-center gap-2 p-6">
                <div className="bg-muted h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
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
