#!/usr/bin/env node

/**
 * Troca o medidor "Dívida vs. Limite do Plano Empresário" nos documentos já
 * gravados: o template `dashboardTemplates/covenants-v2-plano-empresario` e
 * toda página de cliente importada dele.
 *
 * O medidor antigo lia a dívida de UM empreendimento (`ANY_VALUE`) contra um
 * limite fixo de R$ 45 mi e mostrava "folga" com a dívida acima do plano do
 * próprio projeto. O novo lê `covenants.plano_empresario_uso_pct` (dívida sobre
 * o valor do plano, em %) com teto em 100%. Pré-requisito: a métrica existir —
 * rode antes `scripts/seed-covenants-v2-metrics.mjs --apply`.
 *
 * Só toca o bloco que tem a assinatura do antigo (ver `isOldPlanGauge`); todo o
 * resto do documento fica como está. Idempotente: re-executar não grava nada.
 *
 * Usage:
 *   node --env-file-if-exists=.env.local scripts/patch-covenants-plan-gauge.mjs --dry-run
 *   node --env-file-if-exists=.env.local scripts/patch-covenants-plan-gauge.mjs --apply [--allow-prod]
 *
 * O banco vem de `DATAVIZ_DATABASE_ID` — o mesmo env que o app usa. No banco
 * `dataviz` `--apply` exige `--allow-prod`.
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { assertSeedWriteAllowed } from './lib/production-guard.mjs';
import { patchBlockMap } from './lib/plan-gauge-patch.mjs';

const DB_ID = process.env.DATAVIZ_DATABASE_ID || '(default)';
assertSeedWriteAllowed({ databaseId: DB_ID, argv: process.argv, label: 'patch-covenants-plan-gauge' });
const APPLY = process.argv.includes('--apply');
const TEMPLATE_PATH = 'dashboardTemplates/covenants-v2-plano-empresario';

if (getApps().length === 0) initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
const db = getFirestore(DB_ID);

console.log(`${APPLY ? 'APPLY' : 'DRY-RUN'} — patch do medidor do plano empresário  DB: ${DB_ID}\n`);

const refs = [db.doc(TEMPLATE_PATH), ...(await db.collectionGroup('reports').get()).docs.map((d) => d.ref)];
let patched = 0;
for (const ref of refs) {
  const snap = await ref.get();
  if (!snap.exists) continue;
  const next = patchBlockMap(snap.data().blockMap);
  if (!next) continue;
  patched++;
  console.log(`  ${APPLY ? '✓' : '+'} ${ref.path}`);
  if (APPLY) await ref.update({ blockMap: next, updatedAt: new Date() });
}
console.log(`\n${patched} documento(s) ${APPLY ? 'corrigido(s)' : 'a corrigir'}.${APPLY ? '' : ' Repita com --apply.'}`);
