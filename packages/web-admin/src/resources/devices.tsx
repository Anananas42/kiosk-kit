import {
  Create,
  Datagrid,
  DateField,
  Edit,
  List,
  ReferenceField,
  ReferenceInput,
  required,
  SimpleForm,
  TextField,
  TextInput,
} from "react-admin";

export function DeviceList() {
  return (
    <List>
      <Datagrid rowClick="edit">
        <TextField source="name" />
        <ReferenceField source="userId" reference="users" link="show">
          <TextField source="name" />
        </ReferenceField>
        <TextField source="tailscaleIp" label="Tailscale IP" />
        <DateField source="createdAt" label="Created" />
      </Datagrid>
    </List>
  );
}

function DeviceForm() {
  return (
    <SimpleForm>
      <TextInput source="name" validate={required()} />
      <TextInput source="tailscaleIp" label="Tailscale IP" validate={required()} />
      <ReferenceInput source="userId" reference="users"></ReferenceInput>
    </SimpleForm>
  );
}

export function DeviceCreate() {
  return (
    <Create>
      <DeviceForm />
    </Create>
  );
}

export function DeviceEdit() {
  return (
    <Edit>
      <DeviceForm />
    </Edit>
  );
}
