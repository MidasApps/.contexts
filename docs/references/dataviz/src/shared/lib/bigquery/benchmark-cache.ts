import { getAdminFirestore } from '@/shared/lib/firebase/admin';
import { DATAVIZ_DATABASE_ID } from '@/shared/lib/runtime-config';
import { queryBenchmarkAggregated, type BenchmarkClient, type BenchmarkResult } from './queries';

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CacheEntry {
  data: BenchmarkResult;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function getCacheKey(start: string, end: string): string {
  return `${start}:${end}`;
}

async function loadAllClients(): Promise<BenchmarkClient[]> {
  const db = getAdminFirestore(DATAVIZ_DATABASE_ID);
  const snap = await db.collection('clients').get();
  return snap.docs
    .map((doc) => doc.data())
    .filter((d) => d.dataset && d.schema)
    .map((d) => ({ dataset: d.dataset as string, schema: d.schema }));
}

export async function getBenchmarkData(
  startDate: string,
  endDate: string,
): Promise<{ data: BenchmarkResult | null; cached: boolean }> {
  const key = getCacheKey(startDate, endDate);
  const entry = cache.get(key);

  if (entry && Date.now() < entry.expiresAt) {
    return { data: entry.data, cached: true };
  }

  const clients = await loadAllClients();
  if (clients.length === 0) {
    return { data: null, cached: false };
  }

  const result = await queryBenchmarkAggregated(clients, startDate, endDate);

  if (result) {
    cache.set(key, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  return { data: result, cached: false };
}
