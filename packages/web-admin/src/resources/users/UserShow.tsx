import {
  Datagrid,
  DateField,
  ReferenceManyField,
  Show,
  SimpleShowLayout,
  TextField,
} from "react-admin";
import { OnlineStatusField } from "../../components/OnlineStatusField.js";
import { RelativeTimeField } from "../../components/RelativeTimeField.js";

export function UserShow() {
  return (
    <Show>
      <SimpleShowLayout>
        <TextField source="name" />
        <TextField source="email" />
        <TextField source="role" />
        <DateField source="createdAt" label="Created" />
        <ReferenceManyField label="Devices" reference="devices" target="userId">
          <Datagrid bulkActionButtons={false} rowClick="show">
            <TextField source="name" />
            <OnlineStatusField source="online" />
            <RelativeTimeField source="lastSeen" label="Last Seen" />
          </Datagrid>
        </ReferenceManyField>
      </SimpleShowLayout>
    </Show>
  );
}
