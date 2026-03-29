import { Tabs, TabsContent, TabsList, TabsTrigger } from "@kioskkit/ui";
import "./index.css";
import { BuyersTab } from "./tabs/BuyersTab.js";
import { ConsumptionTab } from "./tabs/ConsumptionTab.js";
import { CatalogTab } from "./tabs/catalog/CatalogTab.js";
import { NetworkTab } from "./tabs/network/NetworkTab.js";
import { PreorderTab } from "./tabs/preorder/PreorderTab.js";
import { SettingsTab } from "./tabs/settings/SettingsTab.js";

const TABS = [
  { key: "buyers", label: "Buyers" },
  { key: "catalog", label: "Catalog" },
  { key: "consumption", label: "Consumption" },
  { key: "settings", label: "Settings" },
  { key: "preorder", label: "Preorder Config" },
  { key: "network", label: "Network" },
] as const;

export default function App() {
  return (
    <div className="mx-auto max-w-[960px] px-6 py-4">
      <h1 className="mb-4 text-lg font-semibold">Kiosk Admin</h1>

      <Tabs defaultValue="buyers">
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="catalog">
          <CatalogTab />
        </TabsContent>
        <TabsContent value="buyers">
          <BuyersTab />
        </TabsContent>
        <TabsContent value="consumption">
          <ConsumptionTab />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsTab />
        </TabsContent>
        <TabsContent value="preorder">
          <PreorderTab />
        </TabsContent>
        <TabsContent value="network">
          <NetworkTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
