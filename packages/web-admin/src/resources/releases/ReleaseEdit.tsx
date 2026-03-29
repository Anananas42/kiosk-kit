import { BooleanInput, Edit, SimpleForm, TextInput } from "react-admin";

export function ReleaseEdit() {
  return (
    <Edit redirect="show">
      <SimpleForm>
        <TextInput source="version" disabled />
        <TextInput source="otaAssetUrl" label="OTA Asset URL" disabled fullWidth />
        <TextInput source="otaSha256" label="OTA SHA256 Checksum" disabled fullWidth />
        <TextInput source="appAssetUrl" label="App Bundle URL" disabled fullWidth />
        <TextInput source="appSha256" label="App Bundle SHA256 Checksum" disabled fullWidth />
        <TextInput source="releaseNotes" label="Release Notes" multiline rows={4} fullWidth />
        <BooleanInput
          source="isPublished"
          label="Published"
          helperText="When enabled, this release is visible to customers and available for device updates"
        />
        <BooleanInput
          source="isArchived"
          label="Archived"
          helperText="Archived releases are hidden from the active list but not deleted"
        />
      </SimpleForm>
    </Edit>
  );
}
