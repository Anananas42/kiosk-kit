import { useState } from "react";
import "./styles.css";
import { BuyersTab } from "./tabs/BuyersTab.js";
import { CatalogTab } from "./tabs/CatalogTab.js";
import { ConsumptionTab } from "./tabs/ConsumptionTab.js";
import { NetworkTab } from "./tabs/network/NetworkTab.js";
import { PreorderTab } from "./tabs/PreorderTab.js";
import { SettingsTab } from "./tabs/SettingsTab.js";

type Tab = "catalog" | "buyers" | "consumption" | "settings" | "preorder" | "network";

const TABS: { key: Tab; label: string }[] = [
  { key: "catalog", label: "Catalog" },
  { key: "buyers", label: "Buyers" },
  { key: "consumption", label: "Consumption" },
  { key: "settings", label: "Settings" },
  { key: "preorder", label: "Preorder Config" },
  { key: "network", label: "Network" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("catalog");

  return (
    <div className="app">
      <h1>Kiosk Admin</h1>

      <nav className="tab-nav">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`tab-btn${tab === t.key ? " active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "catalog" && <CatalogTab />}
      {tab === "buyers" && <BuyersTab />}
      {tab === "consumption" && <ConsumptionTab />}
      {tab === "settings" && <SettingsTab />}
      {tab === "preorder" && <PreorderTab />}
      {tab === "network" && <NetworkTab />}
    </div>
  );
}
