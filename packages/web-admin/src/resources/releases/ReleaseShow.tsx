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

function ReleaseShowActions() {
  return (
    <TopToolbar>
      <EditButton />
    </TopToolbar>
  );
}

export function ReleaseShow() {
  return (
    <Show actions={<ReleaseShowActions />}>
      <SimpleShowLayout>
        <TextField source="version" />
        <TextField source="releaseType" label="Release Type" />
        <TextField source="otaAssetUrl" label="OTA Asset URL" />
        <TextField source="otaSha256" label="OTA SHA256 Checksum" />
        <TextField source="appAssetUrl" label="App Bundle URL" />
        <TextField source="appSha256" label="App Bundle SHA256 Checksum" />
        <TextField source="releaseNotes" label="Release Notes" />
        <BooleanField source="isPublished" label="Published" />
        <BooleanField source="isArchived" label="Archived" />
        <ReferenceField source="publishedBy" reference="users" link="show">
          <TextField source="name" />
        </ReferenceField>
        <DateField source="publishedAt" label="Published At" showTime />
      </SimpleShowLayout>
    </Show>
  );
}
