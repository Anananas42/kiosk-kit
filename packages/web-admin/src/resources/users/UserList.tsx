import { Datagrid, DateField, List, ReferenceManyCount, TextField } from "react-admin";

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
