import { join } from "node:path";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { createDb } from "./db/index.js";
import { Store } from "./db/store.js";
import { env, initPairingCode } from "./env.js";

const DATA_DIR = join(process.cwd(), "data");

const { db, sqlite } = createDb(DATA_DIR);
const store = new Store(db);
const app = createApp(store, sqlite, DATA_DIR, db);

await initPairingCode();

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`[server] Listening on http://localhost:${info.port}`);
});
