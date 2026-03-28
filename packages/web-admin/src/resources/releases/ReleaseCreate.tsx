import { Create, required, SimpleForm, TextInput } from "react-admin";

export function ReleaseCreate() {
  return (
    <Create redirect="show">
      <SimpleForm>
        <TextInput source="version" validate={required()} helperText="e.g. 1.3.0" />
        <TextInput
          source="githubAssetUrl"
          label="GitHub Asset URL"
          validate={required()}
          fullWidth
          helperText="URL to the rootfs image asset on GitHub Releases"
        />
        <TextInput
          source="sha256"
          label="SHA256 Checksum"
          validate={required()}
          fullWidth
          helperText="64-character hex digest of the image"
        />
        <TextInput source="releaseNotes" label="Release Notes" multiline rows={4} fullWidth />
      </SimpleForm>
    </Create>
  );
}
