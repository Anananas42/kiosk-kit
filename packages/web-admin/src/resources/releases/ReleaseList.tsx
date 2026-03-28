import {
  BooleanField,
  CreateButton,
  Datagrid,
  List,
  ReferenceField,
  TextField,
  TopToolbar,
} from "react-admin";
import { RelativeTimeField } from "../../components/RelativeTimeField.js";
import { ReleaseFilterSidebar } from "./ReleaseFilterSidebar.js";

function ReleaseListActions() {
  return (
    <TopToolbar>
      <CreateButton />
    </TopToolbar>
  );
}

export function ReleaseList() {
  return (
    <List aside={<ReleaseFilterSidebar />} actions={<ReleaseListActions />}>
      <Datagrid rowClick="show" bulkActionButtons={false}>
        <TextField source="version" />
        <BooleanField source="isPublished" label="Published" />
        <BooleanField source="isArchived" label="Archived" />
        <RelativeTimeField source="publishedAt" label="Created" />
        <ReferenceField source="publishedBy" reference="users" link={false}>
          <TextField source="name" />
        </ReferenceField>
        <TextField source="releaseNotes" label="Notes" />
      </Datagrid>
    </List>
  );
}
