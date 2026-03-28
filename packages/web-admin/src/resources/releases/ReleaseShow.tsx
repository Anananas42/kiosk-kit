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
        <TextField source="githubAssetUrl" label="GitHub Asset URL" />
        <TextField source="sha256" label="SHA256 Checksum" />
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
