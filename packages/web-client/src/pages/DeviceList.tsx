import type { Device } from "@kioskkit/shared";
import {
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
import { Link } from "react-router";
import { DeviceStatusBadge } from "../components/DeviceStatusBadge.js";
import { FreshnessIndicator } from "../components/FreshnessIndicator.js";
import { useDeviceStatus, useDevices } from "../hooks/devices.js";
import { deriveDeviceStatus } from "../lib/device-status.js";

function DeviceRow({ device }: { device: Device }) {
  const { data: appResponding } = useDeviceStatus(device.id);
  const status = deriveDeviceStatus(device.online, appResponding);

  return (
    <TableRow>
      <TableCell>
        {status ? (
          <DeviceStatusBadge status={status} />
        ) : (
          <span className="text-muted-foreground text-xs">…</span>
        )}
      </TableCell>
      <TableCell>
        <Link to={`/devices/${device.id}`} className="font-medium text-foreground hover:underline">
          {device.name}
        </Link>
      </TableCell>
      <TableCell>
        <FreshnessIndicator timestamp={device.lastBackupAt} emptyLabel="No backups" />
      </TableCell>
    </TableRow>
  );
}

export function DeviceList() {
  const { data: devices, isLoading, error } = useDevices();

  if (isLoading) {
    return <p className="text-muted-foreground">Loading devices...</p>;
  }

  if (error) {
    return <p className="text-destructive">Error: {error.message}</p>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Devices</CardTitle>
      </CardHeader>
      <CardContent>
        {!devices || devices.length === 0 ? (
          <p className="text-muted-foreground">No devices registered.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Backup</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {devices.map((d) => (
                <DeviceRow key={d.id} device={d} />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
