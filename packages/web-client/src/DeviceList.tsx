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
import { formatRelativeTime } from "./format.js";

function BackupIndicator({ lastBackupAt }: { lastBackupAt?: string | null }) {
  if (!lastBackupAt) {
    return (
      <span className="flex items-center gap-1.5 text-xs" title="No backups yet">
        <span className="inline-block h-2 w-2 rounded-full bg-gray-400" />
        <span className="text-muted-foreground">No backups</span>
      </span>
    );
  }

  const hoursAgo = (Date.now() - new Date(lastBackupAt).getTime()) / (1000 * 60 * 60);
  let dotColor: string;
  if (hoursAgo < 24) {
    dotColor = "bg-green-500";
  } else if (hoursAgo < 72) {
    dotColor = "bg-yellow-500";
  } else {
    dotColor = "bg-red-500";
  }

  return (
    <span
      className="flex items-center gap-1.5 text-xs"
      title={`Last backup: ${formatRelativeTime(lastBackupAt)}`}
    >
      <span className={`inline-block h-2 w-2 rounded-full ${dotColor}`} />
      <span className="text-muted-foreground">{formatRelativeTime(lastBackupAt)}</span>
    </span>
  );
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
                <TableHead>Backup</TableHead>
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
                  <TableCell>
                    <BackupIndicator lastBackupAt={d.lastBackupAt} />
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
