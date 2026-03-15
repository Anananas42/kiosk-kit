import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { enforceCapacity, formatBackupFilename } from './backup.js';

function makeTmpDir(): string {
  const dir = join(tmpdir(), `backup-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('enforceCapacity', () => {
  it('deletes oldest files when over cap', () => {
    const dir = makeTmpDir();
    writeFileSync(join(dir, '2025-01-01T00-00-00.json.gz'), Buffer.alloc(300));
    writeFileSync(join(dir, '2025-01-02T00-00-00.json.gz'), Buffer.alloc(300));

    // existing 600 + incoming 200 > 700 cap → oldest deleted, then 300 + 200 ≤ 700
    enforceCapacity(dir, 200, 700);

    expect(readdirSync(dir)).toEqual(['2025-01-02T00-00-00.json.gz']);
  });

  it('keeps all files when under cap', () => {
    const dir = makeTmpDir();
    writeFileSync(join(dir, '2025-01-01T00-00-00.json.gz'), Buffer.alloc(100));
    writeFileSync(join(dir, '2025-01-02T00-00-00.json.gz'), Buffer.alloc(100));

    enforceCapacity(dir, 100);

    expect(readdirSync(dir)).toHaveLength(2);
  });
});

describe('formatBackupFilename', () => {
  it('produces Prague-timezone ISO-like filename', () => {
    // 2025-06-15T10:30:00 UTC = 2025-06-15T12:30:00 CEST (UTC+2)
    const date = new Date('2025-06-15T10:30:00Z');
    expect(formatBackupFilename(date)).toBe('2025-06-15T12-30-00.json.gz');
  });
});
