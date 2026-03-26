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
} from "react-admin";

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
        <DateField source="lastSeen" label="Last Seen" showTime />
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
