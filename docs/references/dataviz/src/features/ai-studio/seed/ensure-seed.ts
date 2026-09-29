import { FieldValue } from 'firebase-admin/firestore';
import { SYSTEM_SEEDS, collectionForType } from './manifest';

export interface EnsureSeedOptions { force?: boolean; }

/**
 * Idempotente: cria docs de sistema ausentes. Com `force`, sobrescreve docs
 * EXISTENTES de `origin:'system'` (atualiza conteúdo); nunca toca `origin:'user'`.
 */
export async function ensureSeed(db?: FirebaseFirestore.Firestore, opts: EnsureSeedOptions = {}): Promise<void> {
  const firestore = db ?? (await import('@/shared/lib/firebase/admin')).getDb();
  for (const seed of SYSTEM_SEEDS) {
    const ref = firestore.collection(collectionForType(seed.type)).doc(seed.id);
    const snap = await ref.get();
    if (snap.exists) {
      const data = snap.data() as { origin?: string } | undefined;
      if (!opts.force || data?.origin !== 'system') continue; // preserva user e (sem force) tudo
      await ref.set(
        { ...seed.doc, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
      continue;
    }
    await ref.set({ ...seed.doc, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  }
}
