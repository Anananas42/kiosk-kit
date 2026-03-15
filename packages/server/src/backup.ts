import { mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import {
  BACKUP_INTERVAL_MS,
  BACKUP_MAX_BYTES,
  CONFIG_SHEET,
  CATALOG_SHEET,
  EVIDENCE_SHEET,
  PASTRY_SHEET,
  TZ,
} from '@zahumny/shared';
import { getSheetsClient } from './sheets/client.js';
import { env } from './env.js';

const ALL_RANGES = [
  `${CONFIG_SHEET}!A1:ZZ`,
  `${CATALOG_SHEET}!A1:ZZ`,
  `${EVIDENCE_SHEET}!A1:ZZ`,
  `'${PASTRY_SHEET}'!A1:ZZ`,
];

export async function readAllSheetsRaw(): Promise<Record<string, string[][]>> {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: env.spreadsheetId,
    ranges: ALL_RANGES,
  });

  const result: Record<string, string[][]> = {};
  for (const vr of res.data.valueRanges ?? []) {
    const name = vr.range?.replace(/!.*$/, '').replace(/^'|'$/g, '') ?? '';
    result[name] = (vr.values as string[][]) ?? [];
  }
  return result;
}

export function enforceCapacity(dir: string, incomingBytes: number, maxBytes = BACKUP_MAX_BYTES): void {
  const entries = readdirSync(dir)
    .filter((f) => f.endsWith('.json.gz'))
    .sort();

  let total = entries.reduce((sum, f) => sum + statSync(join(dir, f)).size, 0);

  for (const f of entries) {
    if (total + incomingBytes <= maxBytes) break;
    const path = join(dir, f);
    total -= statSync(path).size;
    unlinkSync(path);
    console.log(`[backup] Deleted old backup ${f}`);
  }
}

export function formatBackupFilename(date: Date): string {
  const fmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
  // sv-SE gives "YYYY-MM-DD HH:mm:ss" → replace space and colons
  return fmt.replace(' ', 'T').replace(/:/g, '-') + '.json.gz';
}

async function runBackup(dataDir: string): Promise<void> {
  const backupsDir = join(dataDir, 'backups');
  try {
    mkdirSync(backupsDir, { recursive: true });
    const data = await readAllSheetsRaw();
    const buffer = gzipSync(JSON.stringify(data));
    const filename = formatBackupFilename(new Date());
    enforceCapacity(backupsDir, buffer.length);
    writeFileSync(join(backupsDir, filename), buffer);
    console.log(`[backup] Saved ${filename} (${(buffer.length / 1024).toFixed(1)} KB)`);
  } catch (err) {
    console.error('[backup] Failed:', err);
  }
}

export function startBackupInterval(dataDir: string): void {
  setTimeout(() => {
    void runBackup(dataDir);
    setInterval(() => void runBackup(dataDir), BACKUP_INTERVAL_MS);
  }, 5_000);
}
