import { join } from "node:path";
import { DEFAULT_KIOSK_SETTINGS } from "@kioskkit/shared";
import { createDb } from "./db/index.js";
import { Store } from "./db/store.js";

const DATA_DIR = join(process.cwd(), "data");

const { db, sqlite } = createDb(DATA_DIR);
console.log("[seed] Migrations applied.");

const store = new Store(db);

// Idempotency check
const existingBuyers = store.getBuyers();
if (existingBuyers.length > 0) {
  console.log(`[seed] Database already has ${existingBuyers.length} buyers — skipping seed.`);
  sqlite.close();
  process.exit(0);
}

// ── Buyers ──────────────────────────────────────────────────────────────────

const buyers = [
  { id: 1, label: "101" },
  { id: 2, label: "102" },
  { id: 3, label: "103" },
  { id: 4, label: "201" },
  { id: 5, label: "202" },
];

for (const b of buyers) {
  store.createBuyer(b.id, b.label);
}
console.log(`[seed] Inserted ${buyers.length} buyers.`);

// ── Catalog ─────────────────────────────────────────────────────────────────

const catalog = [
  {
    name: "Drinks",
    preorder: false,
    items: [
      { name: "Beer", quantity: "0.5l", price: "45" },
      { name: "Wine", quantity: "0.2l", price: "55" },
      { name: "Juice", quantity: "0.25l", price: "35" },
      { name: "Water", quantity: "0.5l", price: "20" },
    ],
  },
  {
    name: "Snacks",
    preorder: false,
    items: [
      { name: "Chips", quantity: "1 bag", price: "40" },
      { name: "Chocolate", quantity: "1 bar", price: "35" },
      { name: "Nuts", quantity: "1 pack", price: "45" },
    ],
  },
  {
    name: "Pastries",
    preorder: true,
    items: [
      { name: "Croissant", quantity: "1 ks", price: "30" },
      { name: "Roll", quantity: "1 ks", price: "15" },
    ],
  },
];

let totalItems = 0;
for (let ci = 0; ci < catalog.length; ci++) {
  const cat = catalog[ci];
  const catId = store.createCategory(cat.name, cat.preorder, ci);
  for (let ii = 0; ii < cat.items.length; ii++) {
    const item = cat.items[ii];
    store.createItem(catId, item.name, item.quantity, item.price, "", ii);
    totalItems++;
  }
}
console.log(`[seed] Inserted ${catalog.length} categories with ${totalItems} items.`);

// ── Settings ────────────────────────────────────────────────────────────────

const settings = DEFAULT_KIOSK_SETTINGS;
store.putSetting("locale", settings.locale);
store.putSetting("currency", settings.currency);
store.putSetting("buyerNoun", settings.buyerNoun);
store.putSetting("maintenance", String(settings.maintenance));
store.putSetting("idleDimMs", String(settings.idleDimMs));
store.putSetting("inactivityTimeoutMs", String(settings.inactivityTimeoutMs));
console.log("[seed] Inserted default settings.");

sqlite.close();
console.log("[seed] Done.");
