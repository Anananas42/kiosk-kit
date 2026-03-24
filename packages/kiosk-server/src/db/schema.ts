import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const buyers = sqliteTable("buyers", {
  id: integer("id").primaryKey(),
  label: text("label").notNull(),
});

export const catalogCategories = sqliteTable("catalog_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  preorder: integer("preorder").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const catalogItems = sqliteTable("catalog_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  categoryId: integer("category_id")
    .notNull()
    .references(() => catalogCategories.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  quantity: text("quantity").notNull().default(""),
  price: text("price").notNull().default(""),
  dphRate: text("dph_rate").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const records = sqliteTable("records", {
  id: text("id").primaryKey(),
  timestamp: text("timestamp").notNull(),
  buyer: integer("buyer")
    .notNull()
    .references(() => buyers.id),
  count: integer("count").notNull(),
  category: text("category").notNull(),
  item: text("item").notNull(),
  itemId: text("item_id").notNull().default(""),
  quantity: text("quantity").notNull().default(""),
  price: text("price").notNull().default(""),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const preorderConfig = sqliteTable("preorder_config", {
  weekday: integer("weekday").primaryKey(),
  ordering: integer("ordering").notNull().default(1),
  delivery: integer("delivery").notNull().default(1),
});
