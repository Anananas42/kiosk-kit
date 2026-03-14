import type { RecordRequest } from '@zahumny/shared';
import { postRecord } from '../api.js';
import { cacheGet, cacheSet } from './cache.js';

const QUEUE_KEY = 'pendingRecords';
const FLUSH_INTERVAL = 30_000;

interface PendingRecord {
  id: string;
  data: RecordRequest;
}

let flushTimer: ReturnType<typeof setInterval> | null = null;
let listeners: Array<() => void> = [];

function getQueue(): PendingRecord[] {
  return cacheGet<PendingRecord[]>(QUEUE_KEY) ?? [];
}

function setQueue(queue: PendingRecord[]): void {
  cacheSet(QUEUE_KEY, queue);
  listeners.forEach((fn) => fn());
}

export function enqueueRecord(data: RecordRequest): void {
  const queue = getQueue();
  queue.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, data });
  setQueue(queue);
  flush();
}

export function getPendingCount(): number {
  return getQueue().length;
}

export function subscribePendingCount(fn: () => void): () => void {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

async function flush(): Promise<void> {
  const queue = getQueue();
  if (queue.length === 0) return;

  const remaining: PendingRecord[] = [];
  for (const entry of queue) {
    try {
      await postRecord(entry.data);
    } catch {
      remaining.push(entry);
    }
  }
  setQueue(remaining);
}

export function startFlushTimer(): void {
  if (flushTimer) return;
  flushTimer = setInterval(flush, FLUSH_INTERVAL);
  window.addEventListener('online', () => void flush());
}
