import Database from 'better-sqlite3';

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS buyers (
      id INTEGER PRIMARY KEY,
      label TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS catalog_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      preorder INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS catalog_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL REFERENCES catalog_categories(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      quantity TEXT NOT NULL DEFAULT '',
      price TEXT NOT NULL DEFAULT '',
      dph_rate TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      buyer INTEGER NOT NULL REFERENCES buyers(id),
      count INTEGER NOT NULL,
      category TEXT NOT NULL,
      item TEXT NOT NULL,
      item_id TEXT NOT NULL DEFAULT '',
      quantity TEXT NOT NULL DEFAULT '',
      price TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS preorder_config (
      weekday INTEGER PRIMARY KEY,
      ordering INTEGER NOT NULL DEFAULT 1,
      delivery INTEGER NOT NULL DEFAULT 1
    );
  `);
}
