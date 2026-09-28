// Operational job; guarded until it is scheduled. When wiring it to a scheduler against dataviz, pass --allow-prod.
/**
 * TTL eviction of AI memory (deletes expired documents).
 *
 * Uso: pnpm cron:eviction [--allow-prod]
 * Every run counts as a write; on `dataviz` it needs `--allow-prod`.
 * `eviction` is imported after the guard because `firebase/admin`
 * initialises the Admin app on import.
 */
import { DATAVIZ_DATABASE_ID } from '@/shared/lib/runtime-config';
import { assertSeedWriteAllowed } from './lib/production-guard.mjs';

const main = async (): Promise<void> => {
  assertSeedWriteAllowed({ databaseId: DATAVIZ_DATABASE_ID, argv: [...process.argv, '--apply'], label: 'cron:eviction' });
  const { runEviction } = await import('@/shared/lib/memory/eviction');
  const r = await runEviction();
  console.log(JSON.stringify({ severity: 'INFO', event: 'eviction.done', ...r }));
  process.exit(0);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
