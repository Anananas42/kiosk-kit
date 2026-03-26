import { Box, Button, ButtonGroup, Chip } from "@mui/material";
import { useMemo, useState } from "react";
import {
  Datagrid,
  DateField,
  Edit,
  FunctionField,
  List,
  ReferenceField,
  ReferenceInput,
  SimpleForm,
  TextField,
  TextInput,
  useListContext,
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

type StatusFilter = "all" | "online" | "offline";

function DeviceStatusFilter({
  value,
  onChange,
}: {
  value: StatusFilter;
  onChange: (filter: StatusFilter) => void;
}) {
  const { data } = useListContext();
  const counts = useMemo(() => {
    const all = data?.length ?? 0;
    const online = data?.filter((d: { online?: boolean }) => d.online).length ?? 0;
    return { all, online, offline: all - online };
  }, [data]);

  return (
    <Box sx={{ mb: 2 }}>
      <ButtonGroup size="small" variant="outlined">
        <Button
          onClick={() => onChange("all")}
          variant={value === "all" ? "contained" : "outlined"}
        >
          All <Chip label={counts.all} size="small" sx={{ ml: 0.5 }} />
        </Button>
        <Button
          onClick={() => onChange("online")}
          variant={value === "online" ? "contained" : "outlined"}
          color="success"
        >
          Online <Chip label={counts.online} size="small" sx={{ ml: 0.5 }} />
        </Button>
        <Button
          onClick={() => onChange("offline")}
          variant={value === "offline" ? "contained" : "outlined"}
          color="error"
        >
          Offline <Chip label={counts.offline} size="small" sx={{ ml: 0.5 }} />
        </Button>
      </ButtonGroup>
    </Box>
  );
}

function FilteredDatagrid({ statusFilter }: { statusFilter: StatusFilter }) {
  const { data, isLoading } = useListContext();

  const filteredData = useMemo(() => {
    if (!data || statusFilter === "all") return data;
    return data.filter((d: { online?: boolean }) =>
      statusFilter === "online" ? d.online : !d.online,
    );
  }, [data, statusFilter]);

  if (isLoading) return null;

  return (
    <Datagrid rowClick="edit" data={filteredData}>
      <TextField source="hostname" />
      <TextField source="name" />
      <TextField source="tailscaleIp" label="Tailscale IP" />
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
      <FunctionField
        label="User"
        render={(record: { userId?: string | null }) =>
          record.userId ? (
            <ReferenceField source="userId" reference="users" link="show">
              <TextField source="name" />
            </ReferenceField>
          ) : (
            <span
              style={{
                color: "#ff9800",
                fontStyle: "italic",
                fontSize: "0.85em",
              }}
            >
              Unassigned
            </span>
          )
        }
      />
      <DateField source="createdAt" label="Created" />
    </Datagrid>
  );
}

export function DeviceList() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  return (
    <List>
      <DeviceStatusFilter value={statusFilter} onChange={setStatusFilter} />
      <FilteredDatagrid statusFilter={statusFilter} />
    </List>
  );
}

export function DeviceEdit() {
  return (
    <Edit>
      <SimpleForm>
        <TextInput source="name" />
        <ReferenceInput source="userId" reference="users" allowEmpty />
      </SimpleForm>
    </Edit>
  );
}
