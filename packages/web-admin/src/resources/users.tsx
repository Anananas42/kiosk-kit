import { Box, MenuItem, Select, type SelectChangeEvent, Typography } from "@mui/material";
import { useState } from "react";
import {
  Button,
  Datagrid,
  DateField,
  FunctionField,
  List,
  ReferenceManyCount,
  ReferenceManyField,
  Show,
  SimpleShowLayout,
  TextField,
  useDataProvider,
  useGetList,
  useNotify,
  useRecordContext,
  useRefresh,
} from "react-admin";

function formatRelativeTime(dateString: string | null | undefined): string {
  if (!dateString) return "Unknown";

  const now = Date.now();
  const then = new Date(dateString).getTime();
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 0) return "Just now";
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function OnlineStatusField({ record }: { record?: { online?: boolean } }) {
  const online = record?.online ?? false;
  return (
    <span
      style={{
        display: "inline-block",
        width: 10,
        height: 10,
        borderRadius: "50%",
        backgroundColor: online ? "#4caf50" : "#f44336",
      }}
      title={online ? "Online" : "Offline"}
    />
  );
}

function AssignDeviceButton() {
  const record = useRecordContext();
  const notify = useNotify();
  const refresh = useRefresh();
  const dataProvider = useDataProvider();
  const [selectedDeviceId, setSelectedDeviceId] = useState("");

  const { data: allDevices, isLoading } = useGetList("devices", {
    pagination: { page: 1, perPage: 1000 },
    sort: { field: "name", order: "ASC" },
  });

  const unassignedDevices = allDevices?.filter((d) => !d.userId) ?? [];

  const handleAssign = async () => {
    if (!selectedDeviceId || !record) return;
    try {
      await dataProvider.update("devices", {
        id: selectedDeviceId,
        data: { userId: record.id },
        previousData: { userId: null },
      });
      notify("Device assigned successfully");
      setSelectedDeviceId("");
      refresh();
    } catch {
      notify("Failed to assign device", { type: "error" });
    }
  };

  if (isLoading) return null;
  if (unassignedDevices.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        No unassigned devices available
      </Typography>
    );
  }

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1 }}>
      <Select
        value={selectedDeviceId}
        onChange={(e: SelectChangeEvent) => setSelectedDeviceId(e.target.value)}
        displayEmpty
        size="small"
        sx={{ minWidth: 250 }}
      >
        <MenuItem value="" disabled>
          Select a device…
        </MenuItem>
        {unassignedDevices.map((device) => (
          <MenuItem key={device.id} value={device.id}>
            {device.name || device.hostname}
          </MenuItem>
        ))}
      </Select>
      <Button label="Assign" onClick={handleAssign} disabled={!selectedDeviceId} />
    </Box>
  );
}

export function UserList() {
  return (
    <List>
      <Datagrid rowClick="show">
        <TextField source="name" />
        <TextField source="email" />
        <TextField source="role" />
        <ReferenceManyCount label="Devices" reference="devices" target="userId" />
        <DateField source="createdAt" label="Created" />
      </Datagrid>
    </List>
  );
}

export function UserShow() {
  return (
    <Show>
      <SimpleShowLayout>
        <TextField source="name" />
        <TextField source="email" />
        <TextField source="role" />
        <DateField source="createdAt" label="Created" />
        <ReferenceManyField label="Devices" reference="devices" target="userId">
          <Datagrid bulkActionButtons={false}>
            <TextField source="name" />
            <FunctionField
              label="Status"
              render={(record: { online?: boolean }) => <OnlineStatusField record={record} />}
            />
            <FunctionField
              label="Last Seen"
              render={(record: { lastSeen?: string | null }) => (
                <span title={record.lastSeen ? new Date(record.lastSeen).toLocaleString() : ""}>
                  {formatRelativeTime(record.lastSeen)}
                </span>
              )}
            />
          </Datagrid>
        </ReferenceManyField>
        <AssignDeviceButton />
      </SimpleShowLayout>
    </Show>
  );
}
