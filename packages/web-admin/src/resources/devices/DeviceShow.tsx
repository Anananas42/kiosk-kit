import {
  BooleanField,
  DateField,
  EditButton,
  ReferenceField,
  Show,
  SimpleShowLayout,
  TextField,
  TopToolbar,
} from "react-admin";
import { OnlineStatusField } from "../../components/OnlineStatusField.js";
import { RelativeTimeField } from "../../components/RelativeTimeField.js";

function DeviceShowActions() {
  return (
    <TopToolbar>
      <EditButton />
    </TopToolbar>
  );
}

export function DeviceShow() {
  return (
    <Show actions={<DeviceShowActions />}>
      <SimpleShowLayout>
        <TextField source="hostname" />
        <TextField source="name" />
        <TextField source="tailscaleIp" label="Tailscale IP" />
        <OnlineStatusField source="online" />
        <RelativeTimeField source="lastSeen" label="Last Seen" />
        <ReferenceField source="userId" reference="users" link="show" emptyText="Unassigned">
          <TextField source="name" />
        </ReferenceField>
        <BooleanField source="hashVerifyEnabled" label="Proxy hash verification" />
        <DateField source="createdAt" label="Created" />
      </SimpleShowLayout>
    </Show>
  );
}
