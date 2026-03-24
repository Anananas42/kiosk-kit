import { copyFileSync, existsSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "migrations");

// Rollback procedure:
// Migration failures are transactional — the DB stays at the previous version.
// A backup is created at <dbPath>.bak-<version> before new migrations run.
// To restore manually:
//   1. Stop the server
//   2. cp data/kioskkit.db.bak-<version> data/kioskkit.db
//   3. Restart the server

interface MigrationFile {
  version: number;
  filename: string;
  sql: string;
}

function loadMigrations(): MigrationFile[] {
  if (!existsSync(MIGRATIONS_DIR)) return [];
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{3}_.*\.sql$/.test(f))
    .sort();
  return files.map((filename) => ({
    version: Number.parseInt(filename.slice(0, 3), 10),
    filename,
    sql: readFileSync(join(MIGRATIONS_DIR, filename), "utf-8"),
  }));
}

function ensureSchemaVersionTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL DEFAULT 0
    );
  `);
  const row = db.prepare("SELECT version FROM schema_version WHERE id = 1").get() as
    | { version: number }
    | undefined;
  if (!row) {
    db.prepare("INSERT INTO schema_version (id, version) VALUES (1, 0)").run();
  }
}

function getCurrentVersion(db: Database.Database): number {
  const row = db.prepare("SELECT version FROM schema_version WHERE id = 1").get() as {
    version: number;
  };
  return row.version;
}

function detectExistingTables(db: Database.Database): boolean {
  const row = db
    .prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table' AND name='buyers'")
    .get() as { cnt: number };
  return row.cnt > 0;
}

function backupDatabase(dbPath: string, currentVersion: number): void {
  const backupPath = `${dbPath}.bak-${currentVersion}`;
  copyFileSync(dbPath, backupPath);
  console.log(`[migrations] Backup created: ${backupPath}`);

  // Keep only last 3 backups
  const dir = dirname(dbPath);
  const baseName = dbPath.split("/").pop();
  const backups = readdirSync(dir)
    .filter((f) => f.startsWith(`${baseName}.bak-`))
    .sort()
    .map((f) => join(dir, f));

  while (backups.length > 3) {
    const oldest = backups.shift()!;
    unlinkSync(oldest);
    console.log(`[migrations] Removed old backup: ${oldest}`);
  }
}

export function runMigrations(db: Database.Database, dbPath?: string): void {
  ensureSchemaVersionTable(db);

  // Bootstrap existing databases: if tables exist but version is 0,
  // assume 001_initial.sql was already applied via the old system
  const currentVersion = getCurrentVersion(db);
  if (currentVersion === 0 && detectExistingTables(db)) {
    db.prepare("UPDATE schema_version SET version = 1 WHERE id = 1").run();
    console.log("[migrations] Detected existing tables, bootstrapped to version 1.");
  }

  const version = getCurrentVersion(db);
  const migrations = loadMigrations().filter((m) => m.version > version);

  if (migrations.length === 0) {
    console.log(`[migrations] Schema is up to date (version ${version}).`);
    return;
  }

  // Backup before applying new migrations (only for on-disk databases)
  if (dbPath && existsSync(dbPath)) {
    backupDatabase(dbPath, version);
  }

  for (const migration of migrations) {
    console.log(`[migrations] Applying ${migration.filename} (version ${migration.version})...`);
    const applyMigration = db.transaction(() => {
      db.exec(migration.sql);
      db.prepare("UPDATE schema_version SET version = ? WHERE id = 1").run(migration.version);
    });
    try {
      applyMigration();
      console.log(`[migrations] Applied ${migration.filename}.`);
    } catch (err) {
      console.error(`[migrations] FAILED to apply ${migration.filename}:`, err);
      if (dbPath) {
        console.error(
          `[migrations] To restore, run: cp ${dbPath}.bak-${version} ${dbPath}`,
        );
      }
      process.exit(1);
    }
  }

  const finalVersion = getCurrentVersion(db);
  console.log(`[migrations] All migrations applied. Schema version: ${finalVersion}.`);
}
