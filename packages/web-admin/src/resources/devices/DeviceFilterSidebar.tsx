import { type Filter, FilterSidebar } from "../../components/FilterSidebar.js";

const DEVICE_FILTERS: Filter[] = [
  {
    label: "Status",
    key: "online",
    items: [
      { value: "true", label: "Online" },
      { value: "false", label: "Offline" },
    ],
  },
  {
    label: "Assignment",
    key: "assigned",
    items: [
      { value: "true", label: "Assigned" },
      { value: "false", label: "Unassigned" },
    ],
  },
];

export function DeviceFilterSidebar() {
  return <FilterSidebar filters={DEVICE_FILTERS} />;
}
