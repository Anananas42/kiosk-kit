import { serve } from '@hono/node-server';
import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { env } from './env.js';
import { runMigrations } from './cache/migrations.js';
import { CacheStore } from './cache/store.js';
import { QueueStore } from './queue/store.js';
import { startSyncInterval } from './queue/sync.js';
import { createApp } from './app.js';

const DATA_DIR = join(process.cwd(), 'data');

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(join(DATA_DIR, 'zahumny.db'), {
  // WAL mode for better concurrency and crash safety
  verbose: undefined,
});
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

runMigrations(db);

const cache = new CacheStore(db);
const queue = new QueueStore(db);

let sheetsOnline = env.sheetsConfigured;

const app = createApp(
  cache,
  queue,
  () => sheetsOnline,
  (online) => { sheetsOnline = online; },
);

if (env.sheetsConfigured) {
  startSyncInterval(queue, (online) => { sheetsOnline = online; });
  const { startReportInterval } = await import('./reports.js');
  startReportInterval(cache);
  const { startBackupInterval } = await import('./backup.js');
  startBackupInterval(DATA_DIR);
}

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`[server] Listening on http://localhost:${info.port}`);
  console.log(`[server] Sheets configured: ${env.sheetsConfigured}`);
});
