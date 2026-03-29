import { Create, SelectInput, SimpleForm, TextInput } from "react-admin";

const releaseTypeChoices = [
  { id: "ota", name: "OTA" },
  { id: "app", name: "App" },
];

export function ReleaseCreate() {
  return (
    <Create redirect="show">
      <SimpleForm>
        <TextInput source="version" isRequired helperText="e.g. 1.3.0" />
        <SelectInput
          source="releaseType"
          choices={releaseTypeChoices}
          isRequired
          defaultValue="ota"
          helperText="OTA for full system updates, App for live app bundle updates"
        />
        <TextInput
          source="otaAssetUrl"
          label="OTA Asset URL"
          fullWidth
          helperText="URL to the rootfs image asset (required if no app bundle)"
        />
        <TextInput
          source="otaSha256"
          label="OTA SHA256 Checksum"
          fullWidth
          helperText="64-character hex digest of the OTA image"
        />
        <TextInput
          source="appAssetUrl"
          label="App Bundle URL"
          fullWidth
          helperText="URL to the app bundle asset (required if no OTA image)"
        />
        <TextInput
          source="appSha256"
          label="App Bundle SHA256 Checksum"
          fullWidth
          helperText="64-character hex digest of the app bundle"
        />
        <TextInput source="releaseNotes" label="Release Notes" multiline rows={4} fullWidth />
      </SimpleForm>
    </Create>
  );
}
