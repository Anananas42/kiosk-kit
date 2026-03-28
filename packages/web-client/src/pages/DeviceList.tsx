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
import { useTranslate } from "../hooks/useTranslate.js";
import { deriveDeviceStatus } from "../lib/device-status.js";

function DeviceRow({ device }: { device: Device }) {
  const { data: appResponding, isLoading: statusLoading } = useDeviceStatus(device.id);
  const status = deriveDeviceStatus(device.online, appResponding);

  return (
    <TableRow>
      <TableCell>
        <DeviceStatusBadge status={status} loading={statusLoading} />
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
    return <p className="text-muted-foreground">{t("deviceList.loading")}</p>;
  }

  if (error) {
    return <p className="text-destructive">{t("common.error", { error: error.message })}</p>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("deviceList.title")}</CardTitle>
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
