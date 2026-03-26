import { Card, CardContent, CardHeader, CardTitle } from "@kioskkit/ui";
import { Monitor } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { type Device, fetchDeviceStatus, fetchDevices } from "./api.js";

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
    <Card>
      <CardHeader>
        <CardTitle>Devices</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-0">
        {devices.map((d) => {
          const online = statuses[d.id];
          return (
            <Link
              key={d.id}
              to={`/devices/${d.id}`}
              className="flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-muted"
            >
              <span
                className={`inline-block h-2 w-2 shrink-0 rounded-full ${online ? "bg-green-500" : "bg-muted-foreground"}`}
              />
              <span className="text-sm font-medium">{d.name}</span>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
