import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@kioskkit/ui";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { type Device, fetchDevice, fetchDeviceStatus } from "./api.js";

export function DeviceDetail() {
  const { id } = useParams<{ id: string }>();
  const [online, setOnline] = useState<boolean | null>(null);
  const [device, setDevice] = useState<Device | null>(null);
  const [iframeLoading, setIframeLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetchDevice(id)
      .then(setDevice)
      .catch(() => {});
    fetchDeviceStatus(id).then(setOnline);
  }, [id]);

  if (!id) return <p className="text-muted-foreground">Missing device ID.</p>;

  return (
    <div className="flex flex-1 flex-col gap-4" style={{ minHeight: 0 }}>
      <div className="flex flex-col gap-3">
        <Button variant="link" className="w-fit px-0" asChild>
          <Link to="/">&larr; Back to devices</Link>
        </Button>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle>{device?.name ?? "Loading..."}</CardTitle>
            {online === null ? (
              <Badge variant="secondary">Checking...</Badge>
            ) : online ? (
              <Badge variant="default">Online</Badge>
            ) : (
              <Badge variant="destructive">Offline</Badge>
            )}
          </CardHeader>
          {online === false && (
            <CardContent>
              <p className="text-sm text-destructive">
                Device is offline. Management is unavailable.
              </p>
            </CardContent>
          )}
        </Card>
      </div>

      {online && (
        <Card className="flex flex-1 flex-col overflow-hidden" style={{ minHeight: 0 }}>
          <CardContent className="relative flex-1 p-0">
            {iframeLoading && <p className="p-6 text-muted-foreground">Loading...</p>}
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
