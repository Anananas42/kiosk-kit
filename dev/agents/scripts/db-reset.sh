#!/usr/bin/env bash
# Reset the Postgres database to a clean state: drop all tables, re-push schema, re-seed.
# Usage: ./dev/agents/scripts/db-reset.sh
set -euo pipefail

DB_URL="${DATABASE_URL:-postgresql://kioskkit:kioskkit@postgres:5432/kioskkit}"

echo "==> Dropping all tables in Postgres..."
NODE_PATH="packages/web-server/node_modules" node -e "
const { Client } = require('pg');
const c = new Client({ connectionString: '${DB_URL}' });
(async () => {
  await c.connect();
  const res = await c.query(
    \"SELECT tablename FROM pg_tables WHERE schemaname = 'public'\"
  );
  for (const row of res.rows) {
    await c.query('DROP TABLE IF EXISTS \"' + row.tablename + '\" CASCADE');
  }
  await c.end();
  console.log('Dropped ' + res.rows.length + ' tables.');
})().catch(e => { console.error(e); process.exit(1); });
"

echo "==> Re-pushing schema..."
pnpm --filter @kioskkit/web-server db:push

echo "==> Re-seeding test user..."
TEST_SESSION_TOKEN=$(pnpm --filter @kioskkit/web-server db:seed-test-user 2>/dev/null | tail -1)
export TEST_SESSION_TOKEN
echo "==> TEST_SESSION_TOKEN=$TEST_SESSION_TOKEN"

echo "==> Database reset complete."
