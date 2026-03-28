import { Card, CardContent } from "@mui/material";
import {
  FilterList,
  FilterListItem,
  type FilterListItemProps,
  SavedQueriesList,
} from "react-admin";

export interface Filter {
  label: string;
  key: string;
  items: readonly { value: string; label: string }[];
  icon?: FilterListItemProps["icon"];
}

interface FilterSidebarProps {
  filters: Filter[];
  children?: React.ReactNode;
}

export function FilterSidebar({ filters, children }: FilterSidebarProps) {
  return (
    <Card sx={{ order: -1, mr: 2, mt: 6, width: 220, flexShrink: 0 }}>
      <CardContent>
        <SavedQueriesList />
        {children}
        {filters.map((filter) => (
          <FilterList key={filter.key} label={filter.label} icon={filter.icon}>
            {filter.items.map((item) => (
              <FilterListItem
                key={item.value}
                label={item.label}
                value={{ [filter.key]: item.value }}
              />
            ))}
          </FilterList>
        ))}
      </CardContent>
    </Card>
  );
}
