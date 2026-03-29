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

// ── Transaction records ─────────────────────────────────────────────────────

const existingRecords = store.getRecords();
if (existingRecords.length > 0) {
  console.log(
    `[seed] Database already has ${existingRecords.length} records — skipping record seed.`,
  );
} else {
  // Deterministic baseline: 2026-03-22T00:00:00.000Z (7 days before 2026-03-29)
  const SEED_BASELINE = new Date("2026-03-22T00:00:00.000Z").getTime();
  const DAY_MS = 86_400_000;

  // Build an item lookup from the seeded catalog for prices/quantities
  const itemLookup: Record<
    string,
    { categoryId: number; category: string; quantity: string; price: string }
  > = {};
  for (const cat of catalog) {
    for (const it of cat.items) {
      itemLookup[it.name] = {
        categoryId: 0, // filled below
        category: cat.name,
        quantity: it.quantity,
        price: it.price,
      };
    }
  }

  const seedRecords: Array<{
    buyer: number;
    item: string;
    count: number;
    dayOffset: number;
    hourOffset: number;
  }> = [
    { buyer: 1, item: "Beer", count: 2, dayOffset: 0, hourOffset: 9 },
    { buyer: 2, item: "Chips", count: 1, dayOffset: 0, hourOffset: 11 },
    { buyer: 3, item: "Croissant", count: 3, dayOffset: 0, hourOffset: 14 },
    { buyer: 1, item: "Water", count: 1, dayOffset: 1, hourOffset: 8 },
    { buyer: 4, item: "Wine", count: 2, dayOffset: 1, hourOffset: 12 },
    { buyer: 5, item: "Juice", count: 1, dayOffset: 1, hourOffset: 16 },
    { buyer: 2, item: "Chocolate", count: 1, dayOffset: 2, hourOffset: 10 },
    { buyer: 3, item: "Beer", count: 1, dayOffset: 2, hourOffset: 13 },
    { buyer: 1, item: "Nuts", count: 2, dayOffset: 3, hourOffset: 9 },
    { buyer: 4, item: "Roll", count: 3, dayOffset: 3, hourOffset: 15 },
    { buyer: 5, item: "Beer", count: 1, dayOffset: 4, hourOffset: 10 },
    { buyer: 2, item: "Wine", count: 2, dayOffset: 4, hourOffset: 14 },
    { buyer: 3, item: "Water", count: 1, dayOffset: 5, hourOffset: 8 },
    { buyer: 1, item: "Chips", count: 1, dayOffset: 5, hourOffset: 12 },
    { buyer: 4, item: "Juice", count: 2, dayOffset: 5, hourOffset: 17 },
    { buyer: 5, item: "Croissant", count: 1, dayOffset: 6, hourOffset: 7 },
    { buyer: 2, item: "Beer", count: 2, dayOffset: 6, hourOffset: 11 },
    { buyer: 3, item: "Chocolate", count: 1, dayOffset: 6, hourOffset: 15 },
  ];

  for (let i = 0; i < seedRecords.length; i++) {
    const r = seedRecords[i];
    const info = itemLookup[r.item];
    const ts = new Date(
      SEED_BASELINE + r.dayOffset * DAY_MS + r.hourOffset * 3_600_000,
    ).toISOString();

    store.insertRecord({
      id: `seed-record-${String(i + 1).padStart(3, "0")}`,
      timestamp: ts,
      buyer: r.buyer,
      count: r.count,
      category: info.category,
      item: r.item,
      itemId: "",
      quantity: info.quantity,
      price: info.price,
      taxRate: "",
    });
  }
  console.log(`[seed] Inserted ${seedRecords.length} transaction records.`);
}

sqlite.close();
console.log("[seed] Done.");
