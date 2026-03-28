import type { Device } from "@kioskkit/shared";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@kioskkit/ui";
import { Link } from "react-router";
import { AddDeviceDialog } from "../components/AddDeviceDialog.js";
import { DeviceStatusBadge } from "../components/DeviceStatusBadge.js";
import { FreshnessIndicator } from "../components/FreshnessIndicator.js";
import { useDeviceStatus, useDevices } from "../hooks/devices.js";
import { useTranslate } from "../hooks/useTranslate.js";

function DeviceRow({ device }: { device: Device }) {
  const { data: status, isLoading: statusLoading, error: statusError } = useDeviceStatus(device.id);

  return (
    <TableRow>
      <TableCell>
        <DeviceStatusBadge status={status} loading={statusLoading} error={statusError} />
      </TableCell>
      <TableCell>
        <Link to={`/devices/${device.id}`} className="font-medium text-foreground hover:underline">
          {device.name}
        </Link>
      </TableCell>
      <TableCell>
        <FreshnessIndicator timestamp={device.lastBackupAt} emptyLabelKey="freshness.noBackups" />
      </TableCell>
    </TableRow>
  );
}

export function DeviceList() {
  const t = useTranslate();
  const { data: devices, isLoading, error } = useDevices();

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("deviceList.title")}</CardTitle>
          <AddDeviceDialog />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("deviceList.table.status")}</TableHead>
                <TableHead>{t("deviceList.table.name")}</TableHead>
                <TableHead>{t("deviceList.table.backup")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {["skeleton-1", "skeleton-2", "skeleton-3", "skeleton-4"].map((key) => (
                <TableRow key={key}>
                  <TableCell>
                    <Skeleton className="h-3 w-3 rounded-full" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return <p className="text-destructive">{t("common.error", { error: error.message })}</p>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t("deviceList.title")}</CardTitle>
        <AddDeviceDialog />
      </CardHeader>
      <CardContent>
        {!devices || devices.length === 0 ? (
          <p className="text-muted-foreground">{t("deviceList.noDevices")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("deviceList.table.status")}</TableHead>
                <TableHead>{t("deviceList.table.name")}</TableHead>
                <TableHead>{t("deviceList.table.backup")}</TableHead>
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
