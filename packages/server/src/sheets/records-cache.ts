import type { EvidenceRow } from '@zahumny/shared';

let cached: { data: EvidenceRow[]; ts: number } | null = null;
const TTL = 5_000;

export function getCachedRecords(): EvidenceRow[] | null {
  if (cached && Date.now() - cached.ts < TTL) return cached.data;
  return null;
}

export function setCachedRecords(data: EvidenceRow[]): void {
  cached = { data, ts: Date.now() };
}

export function invalidateRecordsCache(): void {
  cached = null;
}
