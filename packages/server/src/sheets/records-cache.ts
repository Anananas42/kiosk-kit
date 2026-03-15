import { RECORDS_CACHE_TTL_MS, type EvidenceRow } from '@zahumny/shared';

let cached: { data: EvidenceRow[]; ts: number } | null = null;

export function getCachedRecords(): EvidenceRow[] | null {
  if (cached && Date.now() - cached.ts < RECORDS_CACHE_TTL_MS) return cached.data;
  return null;
}

export function setCachedRecords(data: EvidenceRow[]): void {
  cached = { data, ts: Date.now() };
}

export function invalidateRecordsCache(): void {
  cached = null;
}
