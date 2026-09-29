/**
 * Sprint 3.C — Task 6 / Bulk F4 (ADR-0013)
 *
 * Revalidação em batch do catálogo SQL — Firestore-backed.
 *
 * Marca como `needs_revalidation` toda entrada `approved` cuja
 * `glossaryVersion` ou `regulatoryPackVersion` esteja desatualizada em
 * relação às correntes (ADR-0009 §Implementação).
 *
 * Firestore não suporta OR entre campos diferentes em uma única query, então
 * fazemos duas queries (`!=` por campo) e mesclamos ids num `Set` antes de
 * disparar batched updates (chunk de 500 ops por WriteBatch — limite Admin).
 */
import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from '@/shared/lib/firebase/admin';

const COLLECTION = 'sqlCatalog';
const BATCH_SIZE = 500;

export interface RevalidateCatalogInput {
  glossaryVersion: string;
  regulatoryPackVersion: string;
}

export interface RevalidateCatalogResult {
  affected: number;
}

export async function revalidateCatalog(
  input: RevalidateCatalogInput,
): Promise<RevalidateCatalogResult> {
  const db = getDb();
  const col = db.collection(COLLECTION);

  // Two queries (Firestore disjunction limitation): drift on glossary OR on
  // regulatory pack. Both filtered to status='approved'.
  const [glossarySnap, regulatorySnap] = await Promise.all([
    col
      .where('status', '==', 'approved')
      .where('glossaryVersion', '!=', input.glossaryVersion)
      .get(),
    col
      .where('status', '==', 'approved')
      .where('regulatoryPackVersion', '!=', input.regulatoryPackVersion)
      .get(),
  ]);

  const ids = new Set<string>();
  for (const d of glossarySnap.docs) ids.add(d.id);
  for (const d of regulatorySnap.docs) ids.add(d.id);
  if (ids.size === 0) return { affected: 0 };

  const idArr = Array.from(ids);
  for (let i = 0; i < idArr.length; i += BATCH_SIZE) {
    const slice = idArr.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const id of slice) {
      batch.update(col.doc(id), {
        status: 'needs_revalidation',
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }

  return { affected: ids.size };
}
