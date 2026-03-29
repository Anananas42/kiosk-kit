import {
  AutocompleteInput,
  BooleanInput,
  Edit,
  ReferenceInput,
  SimpleForm,
  TextInput,
} from "react-admin";

export function DeviceEdit() {
  return (
    <Edit redirect="show">
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
        <BooleanInput source="hashVerifyEnabled" label="Hash Verify Enabled" />
      </SimpleForm>
    </Edit>
  );
}
