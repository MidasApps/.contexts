/**
 * Garante os seeds de sistema do AI Studio no Firestore.
 *
 * Grava por padrão: não há `--apply` nem modo dry-run. Por isso a trava de
 * produção (`lib/production-guard.mjs`) trata toda execução como escrita —
 * no banco `dataviz` ela exige `--allow-prod`. `--dry-run` é recusado, porque
 * antes era ignorado e o script gravava mesmo assim.
 *
 * Uso:
 *   pnpm seed:ai-studio [--force] [--allow-prod]
 */
import { ensureSeed } from '@/features/ai-studio/seed/ensure-seed';
import { DATAVIZ_DATABASE_ID } from '@/shared/lib/runtime-config';
import { getSeedDb } from './_firestore-admin';
import { assertSeedWriteAllowed } from './lib/production-guard.mjs';

const LABEL = 'seed:ai-studio';

if (process.argv.includes('--dry-run')) {
  console.error(`[${LABEL}] RECUSADO: este seed não tem modo dry-run; ele sempre grava. Remova --dry-run.`);
  process.exit(2);
}
// The seed writes by default, so the guard sees every run as `--apply`.
assertSeedWriteAllowed({ databaseId: DATAVIZ_DATABASE_ID, argv: [...process.argv, '--apply'], label: LABEL });

const main = async (): Promise<void> => {
  const force = process.argv.includes('--force');
  const db = getSeedDb();
  await ensureSeed(db, { force });
  console.log(`[${LABEL}] seeds de sistema garantidos (force=${force}).`);
};

main().catch((e) => { console.error(e); process.exit(1); });
