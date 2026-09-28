import 'server-only';
import { getAdminFirestore } from '@/shared/lib/firebase/admin';
import { DATAVIZ_DATABASE_ID } from '@/shared/lib/runtime-config';
import { Product, type Product as ProductType } from '@/shared/schemas';

/**
 * Repositório read-side para products/.
 *
 * Cache in-memory com TTL curto (60s) — produtos mudam pouco, mas
 * admin updates precisam propagar rápido. Para invalidação explícita,
 * use invalidateProductCache(id).
 */

const COLLECTION = 'products';
const TTL_MS = 60_000;

interface CacheEntry {
  value: ProductType;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function firestore() {
  return getAdminFirestore(DATAVIZ_DATABASE_ID);
}

export async function getProduct(id: string): Promise<ProductType | null> {
  const now = Date.now();
  const hit = cache.get(id);
  if (hit && hit.expiresAt > now) return hit.value;

  const snap = await firestore().collection(COLLECTION).doc(id).get();
  if (!snap.exists) return null;

  const parsed = Product.parse({ id: snap.id, ...snap.data() });
  cache.set(id, { value: parsed, expiresAt: now + TTL_MS });
  return parsed;
}

export function invalidateProductCache(id?: string): void {
  if (id) cache.delete(id);
  else cache.clear();
}
