import { BooleanField, Datagrid, DateField, List, ReferenceField, TextField } from "react-admin";
import { OnlineStatusField } from "../../components/OnlineStatusField.js";
import { RelativeTimeField } from "../../components/RelativeTimeField.js";
import { DeviceFilterSidebar } from "./DeviceFilterSidebar.js";

export function DeviceList() {
  return (
    <List aside={<DeviceFilterSidebar />}>
      <Datagrid rowClick="show">
        <TextField source="hostname" />
        <TextField source="name" />
        <TextField source="tailscaleIp" label="Tailscale IP" />
        <OnlineStatusField source="online" />
        <RelativeTimeField source="lastSeen" label="Last Seen" />
        <ReferenceField source="userId" reference="users" link="show" emptyText="Unassigned">
          <TextField source="name" />
        </ReferenceField>
        <BooleanField source="hashVerifyEnabled" label="Hash Verify" />
        <DateField source="createdAt" label="Created" />
      </Datagrid>
    </List>
  );
}
