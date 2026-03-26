import { Badge, Card, CardContent, CardHeader, CardTitle } from "@kioskkit/ui";
import { Monitor } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { type Device, fetchDeviceStatus, fetchDevices } from "./api.js";

function formatRelativeTime(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffSeconds = Math.round((now - then) / 1000);

  if (diffSeconds < 60) return "just now";

  const units: { unit: Intl.RelativeTimeFormatUnit; seconds: number }[] = [
    { unit: "year", seconds: 31536000 },
    { unit: "month", seconds: 2592000 },
    { unit: "week", seconds: 604800 },
    { unit: "day", seconds: 86400 },
    { unit: "hour", seconds: 3600 },
    { unit: "minute", seconds: 60 },
  ];

  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const { unit, seconds } of units) {
    const value = Math.floor(diffSeconds / seconds);
    if (value >= 1) return rtf.format(-value, unit);
  }

  return "just now";
}

export function DeviceList() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [statuses, setStatuses] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchDevices()
      .then((d) => {
        setDevices(d);
        setError(null);
        for (const device of d) {
          fetchDeviceStatus(device.id).then((online) =>
            setStatuses((prev) => ({ ...prev, [device.id]: online })),
          );
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="text-muted-foreground">Loading devices...</p>;
  }

  if (error) {
    return <p className="text-destructive">Error: {error}</p>;
  }

  if (devices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <Monitor className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-lg font-semibold">No devices yet</h2>
        <p className="text-sm text-muted-foreground">
          Devices will appear here once they are assigned to your account.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {devices.map((d) => {
        const online = statuses[d.id];
        return (
          <Link key={d.id} to={`/devices/${d.id}`} className="group">
            <Card className="transition-colors group-hover:border-primary">
              <CardHeader>
                <CardTitle className="text-base">{d.name}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block h-2.5 w-2.5 rounded-full ${online ? "bg-green-500" : "bg-muted-foreground"}`}
                  />
                  <span className="text-sm">{online ? "Online" : "Offline"}</span>
                </div>

                {d.lastSeen && (
                  <p className="text-xs text-muted-foreground">
                    Last seen {formatRelativeTime(d.lastSeen)}
                  </p>
                )}

                {/* TODO: Wire up real backup status from KIO-87 */}
                <Badge variant="secondary" className="w-fit text-xs">
                  No backups
                </Badge>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
