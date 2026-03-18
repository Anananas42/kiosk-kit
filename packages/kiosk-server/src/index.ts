import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import Database from "better-sqlite3";
import { createApp } from "./app.js";
import { runMigrations } from "./db/migrations.js";
import { Store } from "./db/store.js";
import { env } from "./env.js";

const DATA_DIR = join(process.cwd(), "data");

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(join(DATA_DIR, "kioskkit.db"), {
  verbose: undefined,
});
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

runMigrations(db);

const store = new Store(db);
const app = createApp(store);

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`[server] Listening on http://localhost:${info.port}`);
});
