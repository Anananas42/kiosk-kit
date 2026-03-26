import type { Meta, StoryObj } from "@storybook/react";
import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";

function DeviceListView({ devices }: { devices: { id: string; name: string; online: boolean }[] }) {
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
                    <Badge variant={d.online ? "default" : "secondary"}>
                      {d.online ? "Online" : "Offline"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium text-foreground">{d.name}</span>
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

const meta: Meta<typeof DeviceListView> = {
  title: "Views/DeviceList",
  component: DeviceListView,
};

export default meta;
type Story = StoryObj<typeof DeviceListView>;

export const WithDevices: Story = {
  args: {
    devices: [
      { id: "1", name: "Lobby Kiosk", online: true },
      { id: "2", name: "Reception Display", online: true },
      { id: "3", name: "Conference Room A", online: false },
      { id: "4", name: "Entrance Terminal", online: true },
      { id: "5", name: "Cafeteria Screen", online: false },
    ],
  },
};

export const Empty: Story = {
  args: {
    devices: [],
  },
};

export const SingleDevice: Story = {
  args: {
    devices: [{ id: "1", name: "Main Kiosk", online: true }],
  },
};
