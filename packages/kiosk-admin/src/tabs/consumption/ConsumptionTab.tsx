import { Spinner, Tabs, TabsContent, TabsList, TabsTrigger } from "@kioskkit/ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { queryKeys } from "../../lib/query.js";
import { trpc } from "../../trpc.js";
import { DateFilterBar } from "./DateFilterBar.js";
import { SummaryTable } from "./SummaryTable.js";
import { TransactionLog } from "./TransactionLog.js";

function getStartOfMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

export function ConsumptionTab() {
  const [from, setFrom] = useState(getStartOfMonth);
  const [to, setTo] = useState("");
  const [buyer, setBuyer] = useState("all");

  const { data: settings } = useQuery({
    queryKey: queryKeys.settings.get(),
    queryFn: () => trpc["admin.settings.get"].query(),
  });

  const { data: buyersData, isLoading: buyersLoading } = useQuery({
    queryKey: queryKeys.buyers.list(),
    queryFn: () => trpc["buyers.list"].query().then((r) => r.buyers),
  });

  const locale = settings?.locale ?? "cs";
  const currency = settings?.currency ?? "CZK";
  const buyers = buyersData ?? [];
  const selectedBuyer = buyer === "all" ? undefined : Number(buyer);

  if (buyersLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted-foreground">
        <Spinner /> Loading...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <DateFilterBar
        from={from}
        to={to}
        buyer={buyer}
        buyers={buyers}
        onFromChange={setFrom}
        onToChange={setTo}
        onBuyerChange={setBuyer}
      />

      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="summary">
          <SummaryTable
            from={from}
            to={to}
            selectedBuyer={selectedBuyer}
            buyers={buyers}
            locale={locale}
            currency={currency}
          />
        </TabsContent>

        <TabsContent value="logs">
          <TransactionLog
            from={from}
            to={to}
            selectedBuyer={selectedBuyer}
            buyers={buyers}
            locale={locale}
            currency={currency}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
