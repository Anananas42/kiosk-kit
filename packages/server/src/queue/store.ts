import type Database from 'better-sqlite3';
import type { RecordEntry } from '@zahumny/shared';

export class QueueStore {
  constructor(private db: Database.Database) {}

  add(entry: RecordEntry): void {
    this.db.prepare('INSERT INTO queue (id, data) VALUES (?, ?)').run(entry.id, JSON.stringify(entry));
  }

  getAll(): RecordEntry[] {
    const rows = this.db.prepare('SELECT data FROM queue ORDER BY created_at ASC').all() as { data: string }[];
    return rows.map((r) => JSON.parse(r.data));
  }

  remove(ids: string[]): void {
    const del = this.db.prepare('DELETE FROM queue WHERE id = ?');
    const tx = this.db.transaction((ids: string[]) => {
      for (const id of ids) del.run(id);
    });
    tx(ids);
  }

  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM queue').get() as { count: number };
    return row.count;
  }
}
