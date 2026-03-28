import { type Filter, FilterSidebar } from "../../components/FilterSidebar.js";

const RELEASE_FILTERS: Filter[] = [
  {
    label: "Published",
    key: "isPublished",
    items: [
      { value: "true", label: "Published" },
      { value: "false", label: "Unpublished" },
    ],
  },
  {
    label: "Archived",
    key: "isArchived",
    items: [
      { value: "true", label: "Archived" },
      { value: "false", label: "Active" },
    ],
  },
];

export function ReleaseFilterSidebar() {
  return <FilterSidebar filters={RELEASE_FILTERS} />;
}
