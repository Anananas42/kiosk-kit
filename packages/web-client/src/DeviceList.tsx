import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@kioskkit/ui";
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Devices</CardTitle>
      </CardHeader>
      <CardContent>
        {devices.length === 0 ? (
          <p className="text-muted-foreground">No devices registered.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Name</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {devices.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <Badge variant={statuses[d.id] ? "default" : "secondary"}>
                      {statuses[d.id] ? "Online" : "Offline"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Link
                      to={`/devices/${d.id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {d.name}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
