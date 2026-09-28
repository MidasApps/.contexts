/**
 * Seed CANÔNICO dos templates de Covenants v2 → Firestore
 * `dashboardTemplates/{id}`. Fonte de verdade = `scripts/templates/*.template.mjs`.
 *
 * Chamava-se `seed-play-templates.ts` e seedava também os 10 templates das
 * páginas fixas do Play; eles saíram na purga de clientes junto com as rotas
 * que os consumiam, e o que sobrou é o conjunto do Vila Rosa.
 *
 * Uso:
 *   pnpm exec tsx scripts/seed-covenants-templates.ts --dry-run
 *   GOOGLE_APPLICATION_CREDENTIALS=… pnpm exec tsx scripts/seed-covenants-templates.ts --apply [--allow-prod]
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { DashboardTemplateDoc, TemplateId } from '../src/shared/schemas/dashboard-template';
import { assertSeedWriteAllowed } from './lib/production-guard.mjs';
/* eslint-disable local/english-identifiers -- each binding mirrors its template
   file and template id, data ids the plan keeps (docs/plans/2026-09-25-english-identifiers.md, Task 20). */
import covenantsV2VisaoExecutiva from './templates/covenants-v2-visao-executiva.template.mjs';
import covenantsV2Empreendimento from './templates/covenants-v2-empreendimento.template.mjs';
import covenantsV2Unidades from './templates/covenants-v2-unidades.template.mjs';
import covenantsV2EvolucaoObra from './templates/covenants-v2-evolucao-obra.template.mjs';
import covenantsV2MapaVendas from './templates/covenants-v2-mapa-vendas.template.mjs';
import covenantsV2Recebiveis from './templates/covenants-v2-recebiveis.template.mjs';
import covenantsV2PlanoEmpresario from './templates/covenants-v2-plano-empresario.template.mjs';
import covenantsV2PerfilCarteira from './templates/covenants-v2-perfil-carteira.template.mjs';
import covenantsV2Inadimplencia from './templates/covenants-v2-inadimplencia.template.mjs';
import covenantsV2FluxoCaixa from './templates/covenants-v2-fluxo-caixa.template.mjs';
import covenantsV2EntradasSaidas from './templates/covenants-v2-entradas-saidas.template.mjs';
import covenantsV2Certidoes from './templates/covenants-v2-certidoes.template.mjs';
import covenantsV2ExtratoDetalhado from './templates/covenants-v2-extrato-detalhado.template.mjs';
/* eslint-enable local/english-identifiers */

const COLLECTION = 'dashboardTemplates';
// Projeto/DB do ambiente — mesmo Firestore que o runtime lê via
// DATAVIZ_DATABASE_ID. Sem fallback para projeto de terceiros.
const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  ?? process.env.GOOGLE_CLOUD_PROJECT
  ?? process.env.GCP_PROJECT_ID;
const DB_ID = process.env.DATAVIZ_DATABASE_ID
  ?? process.env.FIRESTORE_DATABASE_ID
  ?? 'dataviz';
if (!PROJECT_ID) {
  console.error('Defina NEXT_PUBLIC_FIREBASE_PROJECT_ID ou GOOGLE_CLOUD_PROJECT.');
  process.exit(1);
}
const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');
// Before any Firestore client: `--apply` on `dataviz` needs `--allow-prod`.
assertSeedWriteAllowed({ databaseId: DB_ID, argv: process.argv, label: 'seed-covenants-templates' });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TEMPLATES: any[] = [
  covenantsV2VisaoExecutiva, covenantsV2Empreendimento, covenantsV2Unidades, covenantsV2EvolucaoObra,
  covenantsV2MapaVendas, covenantsV2Recebiveis, covenantsV2PlanoEmpresario, covenantsV2PerfilCarteira, covenantsV2Inadimplencia,
  covenantsV2FluxoCaixa, covenantsV2EntradasSaidas, covenantsV2Certidoes, covenantsV2ExtratoDetalhado,
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validate(t: any): { id: string; doc: Record<string, unknown> } {
  const idR = TemplateId.safeParse(t?.id);
  if (!idR.success) throw new Error(`template id inválido: ${JSON.stringify(t?.id)}`);
  const parsed = DashboardTemplateDoc.safeParse({
    ...t,
    status: t.status ?? 'active',
    createdAt: 0,
    updatedAt: 0,
  });
  if (!parsed.success) {
    throw new Error(`template "${t.id}" inválido — ${JSON.stringify(parsed.error.issues)}`);
  }
  const { createdAt: _c, updatedAt: _u, ...doc } = parsed.data;
  return { id: idR.data, doc };
}

async function main(): Promise<void> {
  if (!DRY_RUN && !APPLY) {
    console.error('Especifique --dry-run ou --apply');
    process.exit(2);
  }
  console.log(`${DRY_RUN ? 'DRY-RUN' : 'APPLY'} — ${TEMPLATES.length} templates → ${COLLECTION}`);
  const validated = TEMPLATES.map(validate);
  for (const { id, doc } of validated) {
    const blocks = Object.keys((doc.blockMap as Record<string, unknown>) ?? {}).length;
    const refs = ((doc.metricRefs as string[]) ?? []).length;
    const prod = ((doc.productRefs as string[]) ?? []).join(',');
    console.log(`  ~ ${id}  (blocks=${blocks}, metricRefs=${refs}, productRefs=${prod})`);
  }
  if (DRY_RUN) {
    console.log('(dry-run — nada gravado)');
    return;
  }
  if (getApps().length === 0) initializeApp({ projectId: PROJECT_ID });
  const db = getFirestore(DB_ID);
  for (const { id, doc } of validated) {
    const ref = db.collection(COLLECTION).doc(id);
    const existing = await ref.get();
    // Round-trip JSON descarta `undefined` (Firestore não aceita) — templates
    // são dados puros (sem Date/função), então é seguro.
    const clean = JSON.parse(JSON.stringify(doc));
    await ref.set(
      {
        ...clean,
        updatedAt: FieldValue.serverTimestamp(),
        ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      },
      { merge: true },
    );
    console.log(`  ✓ ${id}`);
  }
  console.log('Concluído.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
