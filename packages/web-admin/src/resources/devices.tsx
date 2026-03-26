import {
  AutocompleteInput,
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
} from "react-admin";
import { formatRelativeTime, OnlineStatusField } from "./shared.js";

export function DeviceList() {
  return (
    <List>
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
        <ReferenceInput source="userId" reference="users">
          <AutocompleteInput
            optionText={(user) =>
              user?.email ? `${user.name} (${user.email})` : (user?.name ?? "")
            }
            label="Assigned User"
          />
        </ReferenceInput>
      </SimpleForm>
    </Edit>
  );
}
