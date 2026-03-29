import type { CatalogCategory } from "@kioskkit/shared";
import { Accordion, Spinner } from "@kioskkit/ui";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query.js";
import { trpc } from "../../trpc.js";
import { AddCategoryDialog } from "./AddCategoryDialog.js";
import { CategorySection } from "./CategorySection.js";

export function CatalogTab() {
  const { data: catalog, isLoading } = useQuery({
    queryKey: queryKeys.catalog.list(),
    queryFn: () => trpc["catalog.list"].query(),
  });

  const { data: settings } = useQuery({
    queryKey: queryKeys.settings.get(),
    queryFn: () => trpc["admin.settings.get"].query(),
  });

  const locale = settings?.locale ?? "cs";
  const currency = settings?.currency ?? "CZK";

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted-foreground">
        <Spinner /> Loading catalog...
      </div>
    );
  }

  const categories = catalog ?? [];

  return (
    <div>
      {categories.length === 0 && (
        <p className="py-4 italic text-muted-foreground">No categories yet.</p>
      )}

      {categories.length > 0 && (
        <Accordion type="single" collapsible className="flex flex-col gap-2">
          {categories.map((category, index) => (
            <CategorySection
              key={category.id}
              category={category}
              locale={locale}
              currency={currency}
              isFirst={index === 0}
              isLast={index === categories.length - 1}
            />
          ))}
        </Accordion>
      )}

      <AddCategoryDialog nextSortOrder={getNextSortOrder(categories)} />
    </div>
  );
}

function getNextSortOrder(categories: CatalogCategory[]): number {
  if (categories.length === 0) return 0;
  return Math.max(...categories.map((c) => c.sortOrder)) + 1;
}
