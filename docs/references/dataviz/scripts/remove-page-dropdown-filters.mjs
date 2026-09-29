/**
 * Tira os seletores de página dos relatórios já gravados (ADR-0025).
 *
 * Os templates deixaram de declarar filtro `control: 'dropdown'`, mas template
 * só vale no import: os relatórios em produção já têm os filtros dentro do
 * próprio documento. Sem esta varredura, a página continuaria mostrando
 * Tipo/Categoria/Banco para sempre.
 *
 * O que ele NÃO toca:
 *
 * - `date_range`, `snapshot` e `ate` — não são seletores de tela, são como as
 *   métricas da página recebem o período escolhido no painel. Apagá-los faria
 *   os blocos pararem de responder à data, em silêncio;
 * - qualquer outra chave sem `control: 'dropdown'`.
 *
 * Reversível pelo produto, não pelo script: o usuário pede o filtro de volta ao
 * assistente (`add_page_filter`). As métricas seguem citando
 * `{filter.banco:…}` no template — placeholder sem filtro declarado vira `1=1`
 * —, então recriá-lo com a MESMA chave o faz valer de novo na hora.
 *
 * Usage:
 *   node scripts/remove-page-dropdown-filters.mjs --dry-run
 *   node scripts/remove-page-dropdown-filters.mjs --apply [--allow-prod]
 *
 * O banco vem de `DATAVIZ_DATABASE_ID`, com produção como default — o mesmo
 * env que o app usa. Confira antes de rodar com `--apply`. No banco `dataviz`
 * `--apply` exige `--allow-prod`; `--dry-run` junto com `--apply` é recusado.
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { resolveGcpProject, resolveDatabaseId } from './lib/gcp-ids.mjs';
import { assertSeedWriteAllowed } from './lib/production-guard.mjs';

const PROJECT_ID = resolveGcpProject();
const DB_ID = resolveDatabaseId();

const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');
if (!DRY_RUN && !APPLY) {
  console.error('Especifique --dry-run ou --apply');
  process.exit(2);
}
assertSeedWriteAllowed({ databaseId: DB_ID, argv: process.argv, label: 'remove-page-dropdown-filters' });

/** Chaves que carregam o período da página — nunca são seletor. */
const TIME_AXIS = new Set(['date_range', 'snapshot', 'ate']);

if (getApps().length === 0) initializeApp({ projectId: PROJECT_ID });
const db = getFirestore(DB_ID);

async function main() {
  console.log(`Banco: ${DB_ID} — ${APPLY ? 'APLICANDO' : 'simulação (--dry-run)'}\n`);

  const clients = await db.collection('clients').get();
  let pagesWithFilter = 0;
  let removedFilters = 0;

  for (const client of clients.docs) {
    const grupos = await client.ref.collection('groups').get();
    for (const grupo of grupos.docs) {
      const reports = await grupo.ref.collection('reports').get();
      for (const report of reports.docs) {
        const declared = report.data()?.filters?.metricPageFilters ?? {};
        const selectors = Object.entries(declared).filter(
          ([key, cfg]) => cfg?.control === 'dropdown' && !TIME_AXIS.has(key),
        );
        if (selectors.length === 0) continue;

        pagesWithFilter += 1;
        removedFilters += selectors.length;
        const path = `${client.id}/${grupo.id}/${report.id}`;
        console.log(`  - ${path}: ${selectors.map(([k, c]) => c.label ?? k).join(', ')}`);

        if (APPLY) {
          const deleteKeys = {};
          for (const [key] of selectors) {
            deleteKeys[`filters.metricPageFilters.${key}`] = FieldValue.delete();
          }
          await report.ref.update(deleteKeys);
        }
      }
    }
  }

  console.log(
    `\n${APPLY ? 'Removidos' : 'Seriam removidos'}: ${removedFilters} filtro(s) em ${pagesWithFilter} página(s).`,
  );
  if (removedFilters === 0) console.log('Nada a fazer.');
}

main().catch((err) => {
  console.error('Falhou:', err);
  process.exit(1);
});
