import type Database from 'better-sqlite3';
import type { CatalogCategory, Apartment } from '@zahumny/shared';

export class CacheStore {
  constructor(private db: Database.Database) {}

  getCatalog(): CatalogCategory[] | null {
    const row = this.db.prepare('SELECT value FROM cache WHERE key = ?').get('catalog') as { value: string } | undefined;
    return row ? JSON.parse(row.value) : null;
  }

  setCatalog(catalog: CatalogCategory[]): void {
    this.db.prepare(
      `INSERT INTO cache (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).run('catalog', JSON.stringify(catalog));
  }

  getApartments(): Apartment[] | null {
    const row = this.db.prepare('SELECT value FROM cache WHERE key = ?').get('apartments') as { value: string } | undefined;
    return row ? JSON.parse(row.value) : null;
  }

  setApartments(apartments: Apartment[]): void {
    this.db.prepare(
      `INSERT INTO cache (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).run('apartments', JSON.stringify(apartments));
  }
}
