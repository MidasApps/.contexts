#!/usr/bin/env tsx
// Operational job; guarded until it is scheduled. When wiring it to a scheduler against dataviz, pass --allow-prod.
/**
 * Sprint 3.C — Task 6 / Bulk F4 (ADR-0013)
 *
 * Cron job: marca entradas `approved` do catálogo SQL (Firestore collection
 * `sqlCatalog`) como `needs_revalidation` quando `glossaryVersion`/
 * `regulatoryPackVersion` divergirem das versões correntes.
 *
 * Agendamento sugerido (Cloud Scheduler): daily 03:00 UTC. Idempotente — pode
 * rodar múltiplas vezes sem efeito colateral.
 *
 * Uso:
 *   pnpm cron:revalidate-catalog [--allow-prod]
 *
 * Every run counts as a write; on `dataviz` it needs `--allow-prod`.
 * `revalidation` is imported after the guard because `firebase/admin`
 * initialises the Admin app on import.
 *
 * Versões:
 *   - `glossaryVersion`: lida de `src/shared/config/glossary.ts` (GLOSSARY_VERSION).
 *   - `regulatoryPackVersion`: `process.env.REGULATORY_PACK_VERSION`
 *     (constante centralizada não existe ainda; fallback para `'unversioned'`).
 */
import { GLOSSARY_VERSION } from '@/shared/config/glossary';
import { DATAVIZ_DATABASE_ID } from '@/shared/lib/runtime-config';
import { assertSeedWriteAllowed } from '../lib/production-guard.mjs';

async function main(): Promise<void> {
  assertSeedWriteAllowed({
    databaseId: DATAVIZ_DATABASE_ID,
    argv: [...process.argv, '--apply'],
    label: 'cron:revalidate-catalog',
  });
  const { revalidateCatalog } = await import('@/features/sql-catalog/revalidation');
  const glossaryVersion = process.env.GLOSSARY_VERSION ?? GLOSSARY_VERSION;
  const regulatoryPackVersion = process.env.REGULATORY_PACK_VERSION ?? 'unversioned';

  // eslint-disable-next-line no-console
  console.log(
    `[revalidate-catalog] glossary=${glossaryVersion} regulatoryPack=${regulatoryPackVersion}`,
  );

  const result = await revalidateCatalog({ glossaryVersion, regulatoryPackVersion });

  // eslint-disable-next-line no-console
  console.log(`[revalidate-catalog] affected=${result.affected}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[revalidate-catalog] failed:', err);
  process.exit(1);
});
