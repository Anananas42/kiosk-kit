import {
  Datagrid,
  DateField,
  Edit,
  FunctionField,
  List,
  NullableBooleanInput,
  ReferenceField,
  ReferenceInput,
  SimpleForm,
  TextField,
  TextInput,
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

const deviceFilters = [
  <NullableBooleanInput
    key="online"
    source="online"
    label="Status"
    falseLabel="Offline"
    trueLabel="Online"
    alwaysOn
  />,
];

export function DeviceList() {
  return (
    <List filters={deviceFilters}>
      <Datagrid rowClick="edit">
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
