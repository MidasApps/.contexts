/**
 * Seed dos 25 templates `imobiliaria-*` → `dashboardTemplates/{id}`.
 * Fonte de verdade = `scripts/templates/real-estate/*.mjs`, validados com o
 * Zod real (`DashboardTemplateDoc`) antes de gravar. Molde: `seed-covenants-templates.ts`.
 *
 * Uso:
 *   pnpm exec tsx --env-file=.env.local scripts/seed-real-estate-templates.ts --dry-run
 *   pnpm exec tsx --env-file=.env.local scripts/seed-real-estate-templates.ts --apply
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { DashboardTemplateDoc, TemplateId } from '../src/shared/schemas/dashboard-template';
import { templates } from './templates/real-estate.mjs';
import { assertSeedWriteAllowed } from './lib/production-guard.mjs';

const COLLECTION = 'dashboardTemplates';
const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCP_PROJECT_ID;
const DB_ID = process.env.DATAVIZ_DATABASE_ID ?? process.env.FIRESTORE_DATABASE_ID ?? 'dataviz';
if (!PROJECT_ID) { console.error('Defina NEXT_PUBLIC_FIREBASE_PROJECT_ID ou GOOGLE_CLOUD_PROJECT.'); process.exit(1); }
const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');
assertSeedWriteAllowed({ databaseId: DB_ID, argv: process.argv, label: 'seed-real-estate-templates' });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validate(t: any): { id: string; doc: Record<string, unknown> } {
  const idResult = TemplateId.safeParse(t?.id);
  if (!idResult.success) throw new Error(`template id inválido: ${JSON.stringify(t?.id)}`);
  const parsed = DashboardTemplateDoc.safeParse({ ...t, status: t.status ?? 'active', createdAt: 0, updatedAt: 0 });
  if (!parsed.success) throw new Error(`template "${t.id}" inválido — ${JSON.stringify(parsed.error.issues)}`);
  const { createdAt: _createdAt, updatedAt: _updatedAt, ...doc } = parsed.data;
  return { id: idResult.data, doc };
}

async function main(): Promise<void> {
  if (!DRY_RUN && !APPLY) { console.error('Especifique --dry-run ou --apply'); process.exit(2); }
  console.log(`${DRY_RUN ? 'DRY-RUN' : 'APPLY'} — ${templates.length} templates → ${COLLECTION}  (project=${PROJECT_ID} db=${DB_ID})`);
  const validated = templates.map(validate);
  for (const { id, doc } of validated) {
    console.log(`  ~ ${id}  (blocks=${Object.keys(doc.blockMap as object).length}, metricRefs=${(doc.metricRefs as string[]).length})`);
  }
  if (DRY_RUN) { console.log('(dry-run — nada gravado)'); return; }
  if (getApps().length === 0) initializeApp({ projectId: PROJECT_ID });
  const db = getFirestore(DB_ID);
  let created = 0, updated = 0;
  for (const { id, doc } of validated) {
    const ref = db.collection(COLLECTION).doc(id);
    const existing = await ref.get();
    const clean = JSON.parse(JSON.stringify(doc));
    if (existing.exists) { await ref.set({ ...clean, updatedAt: FieldValue.serverTimestamp() }, { merge: false }); updated++; }
    else { await ref.set({ ...clean, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }); created++; }
  }
  console.log(`\n${created} criado(s), ${updated} atualizado(s).`);
}
main().catch((e) => { console.error('[seed-real-estate-templates] FAILED:', e instanceof Error ? e.message : e); process.exit(1); });
