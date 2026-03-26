import { join } from "node:path";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { startBackupSchedule } from "./backup.js";
import { createDb } from "./db/index.js";
import { Store } from "./db/store.js";
import { env, isCloudConfigured } from "./env.js";

const DATA_DIR = join(process.cwd(), "data");

const { db, sqlite } = createDb(DATA_DIR);
const store = new Store(db);
const app = createApp(store);

if (isCloudConfigured()) {
  startBackupSchedule(sqlite, store);
}

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`[server] Listening on http://localhost:${info.port}`);
});
