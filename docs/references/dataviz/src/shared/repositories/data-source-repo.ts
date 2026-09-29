import 'server-only';
import { getAdminFirestore } from '@/shared/lib/firebase/admin';
import { DATAVIZ_DATABASE_ID } from '@/shared/lib/runtime-config';
import { DataSource, type DataSource as DataSourceType } from '@/shared/schemas';
import { rememberProjectIds } from '@/shared/lib/bigquery/known-project-ids';

const COLLECTION = 'dataSources';
const TTL_MS = 300_000; // 5 min — muda raramente

interface CacheEntry {
  value: DataSourceType;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function firestore() {
  return getAdminFirestore(DATAVIZ_DATABASE_ID);
}

export async function getDataSource(id: string): Promise<DataSourceType | null> {
  const now = Date.now();
  const hit = cache.get(id);
  if (hit && hit.expiresAt > now) return hit.value;

  const snap = await firestore().collection(COLLECTION).doc(id).get();
  if (!snap.exists) return null;

  const parsed = DataSource.parse({ id: snap.id, ...snap.data() });
  // Todo projeto que o app lê vira id conhecido para a redação de erro.
  rememberProjectIds([parsed.projectId]);
  cache.set(id, { value: parsed, expiresAt: now + TTL_MS });
  return parsed;
}

export function invalidateDataSourceCache(id?: string): void {
  if (id) cache.delete(id);
  else cache.clear();
}
