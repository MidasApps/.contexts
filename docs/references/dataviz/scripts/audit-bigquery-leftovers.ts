/**
 * Audita o warehouse BigQuery em busca de datasets de clientes purgados.
 *
 * SOMENTE LEITURA — este script nunca apaga. Ele produz a lista para decisão
 * humana, e essa separação é deliberada: o warehouse é COMPARTILHADO com outros
 * sistemas da casa, então apagar por padrão de nome pode destruir dado de outro
 * produto. Um dataset só é "resto" depois de alguém confirmar que era desta
 * aplicação.
 *
 * Uso:
 *   pnpm bq:audit-leftovers
 *   pnpm bq:audit-leftovers --project=bq-data-wh
 */
// SDK direto, e não `@/shared/lib/bigquery/client`: aquele módulo começa com
// `import 'server-only'`, que não resolve fora do bundler do Next (mesmo motivo
// que existe o `_firestore-admin.ts` para o Firestore).
import { BigQuery } from '@google-cloud/bigquery';
import { tenantDatasetSegment } from '@/shared/config/tenants';
import { loadActiveClients, connectFirestore, resolveProject } from './lib/firestore-connection';

/** Tenants removidos na purga — os nomes que sobreviveram no git e nos docs. */
const PURGED = [
  'om', 'brz', 'conx', 'imcasa', 'galli',
  'spl', 'vivamus', 'vila-brasil', 'jotanunes',
];

function segment(id: string): string {
  return id.replace(/-/g, '_').toLowerCase();
}

async function main() {
  const projectArg = process.argv.find((a) => a.startsWith('--project='))?.split('=')[1];
  const projectId = projectArg ?? process.env.GCP_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const database = process.argv.find((a) => a.startsWith('--database='))?.split('=')[1];
  if (!database) {
    console.error('Faltou --database=<id>: os clientes ativos vêm do cadastro, não de lista no código.');
    process.exit(1);
  }
  const bq = new BigQuery({ projectId });
  const [datasets] = await bq.getDatasets();

  // Quais datasets são de cliente vivo se decide pelo cadastro. Com a lista no
  // código, um cliente novo apareceria como "resto" e entraria numa lista de
  // candidatos a deleção — no BigQuery, que é produção compartilhada.
  const db = connectFirestore(database, resolveProject(projectArg));
  const clients = await loadActiveClients(db);
  const active = new Set(clients.map((t) => tenantDatasetSegment(t)));
  console.log(`Clientes ativos (cadastro): ${clients.join(', ') || '(nenhum)'}\n`);
  const purged = new Set(PURGED.map(segment));

  const classified = { ativo: [] as string[], purged: [] as string[], other: [] as string[] };

  for (const d of datasets) {
    const id = d.id ?? '';
    const prefix = id.toLowerCase();
    if ([...active].some((a) => prefix.startsWith(a))) classified.ativo.push(id);
    else if ([...purged].some((p) => prefix.startsWith(`${p}_`) || prefix === p)) classified.purged.push(id);
    else classified.other.push(id);
  }

  console.log(`Projeto: ${projectId}`);
  console.log(`${datasets.length} datasets\n`);

  console.log(`── DESTA aplicação, tenant ATIVO (${classified.ativo.length}) — manter`);
  for (const d of classified.ativo.sort()) console.log(`   ${d}`);

  console.log(`\n── Batem com nome de tenant PURGADO (${classified.purged.length}) — candidatos`);
  for (const d of classified.purged.sort()) console.log(`   ${d}`);
  if (classified.purged.length === 0) console.log('   (nenhum)');

  console.log(`\n── NÃO reconhecidos (${classified.other.length}) — provavelmente de outros sistemas`);
  for (const d of classified.other.sort()) console.log(`   ${d}`);

  console.log(
    '\nNada foi apagado. Os "candidatos" precisam de confirmação humana de que\n' +
    'pertenciam a esta aplicação antes de qualquer remoção — o warehouse é\n' +
    'compartilhado, e um nome parecido não é prova de dono.',
  );
}

main().catch((err) => {
  console.error('Falha na auditoria:', err);
  process.exit(1);
});
