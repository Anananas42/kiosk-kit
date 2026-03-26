import {
  BooleanField,
  BooleanInput,
  Create,
  Datagrid,
  Edit,
  FunctionField,
  List,
  ReferenceField,
  required,
  SimpleForm,
  TextField,
  TextInput,
} from "react-admin";
import { formatRelativeTime } from "./shared.js";

export function ReleaseList() {
  return (
    <List>
      <Datagrid rowClick="edit" bulkActionButtons={false}>
        <TextField source="version" />
        <BooleanField source="isPublished" label="Published" />
        <BooleanField source="isArchived" label="Archived" />
        <FunctionField
          label="Created"
          render={(record: { publishedAt?: string }) => (
            <span title={record.publishedAt ? new Date(record.publishedAt).toLocaleString() : ""}>
              {formatRelativeTime(record.publishedAt)}
            </span>
          )}
        />
        <ReferenceField source="publishedBy" reference="users" link={false}>
          <TextField source="name" />
        </ReferenceField>
        <FunctionField
          label="Notes"
          render={(record: { releaseNotes?: string | null }) => (
            <span
              style={{
                maxWidth: 300,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                display: "inline-block",
              }}
              title={record.releaseNotes ?? ""}
            >
              {record.releaseNotes ?? "—"}
            </span>
          )}
        />
      </Datagrid>
    </List>
  );
}

export function ReleaseCreate() {
  return (
    <Create>
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

export function ReleaseEdit() {
  return (
    <Edit>
      <SimpleForm>
        <TextInput source="version" disabled />
        <TextInput source="githubAssetUrl" label="GitHub Asset URL" disabled fullWidth />
        <TextInput source="sha256" label="SHA256 Checksum" disabled fullWidth />
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
