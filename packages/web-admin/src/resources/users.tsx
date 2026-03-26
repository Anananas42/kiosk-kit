import {
  Datagrid,
  DateField,
  FunctionField,
  List,
  ReferenceManyCount,
  ReferenceManyField,
  Show,
  SimpleShowLayout,
  TextField,
} from "react-admin";
import { formatRelativeTime, OnlineStatusField } from "./shared.js";

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
          <Datagrid bulkActionButtons={false} rowClick="edit">
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
      </SimpleShowLayout>
    </Show>
  );
}
