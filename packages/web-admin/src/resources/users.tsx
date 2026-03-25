import { Datagrid, DateField, List, Show, SimpleShowLayout, TextField } from "react-admin";

export function UserList() {
  return (
    <List>
      <Datagrid rowClick="show">
        <TextField source="name" />
        <TextField source="email" />
        <TextField source="role" />
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
      </SimpleShowLayout>
    </Show>
  );
}
