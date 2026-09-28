/**
 * Escopo de leitura de uma query: quais datasets (e, para referência
 * compartilhada, quais tabelas) ela pode ler, conferido contra o que o
 * PRÓPRIO BigQuery resolve no dry-run (`referencedTables`/`referencedRoutines`).
 *
 * Fonte única da regra, usada por:
 * - `features/ai-agents/lib/tenant-query.ts` — SQL do `execute_sql` e dos tools BQML;
 * - `shared/lib/metrics/execute-metric.ts` — compilação (dry-run) de template de
 *   métrica, inclusive o que o assistente escreve em `create_metric`/`update_metric`.
 *
 * Por que o dry-run e não o texto: a guarda de texto de métrica olhava só o
 * token depois de FROM/JOIN, e `FROM {contratos}, outro.tabela`, `outro . tabela`,
 * `outro/**​/.tabela` e `APPENDS(TABLE outro.tabela, …)` passavam. O BigQuery
 * lista todas essas em `referencedTables`.
 */

export interface AllowedDataset {
  /** Ausente = projeto padrão de quem confere (cliente BigQuery ou dataSource). */
  projectId?: string;
  datasetId: string;
  /** Presente = só estas tabelas do dataset (referência compartilhada). */
  tableIds?: readonly string[];
}

/**
 * Tabelas de referência que não são de tenant nenhum e que as métricas do
 * catálogo juntam com dado de cliente. Liberadas por TABELA, não por dataset:
 * o que entrar depois em `dataviz_aux` não fica legível por reflexo.
 *
 * Só entra aqui o que SQL real usa. Hoje, 5 dos 332 templates em `metrics`
 * (os `covenants.*` de transações bancárias) fazem LEFT JOIN nestas duas:
 * código de banco (`ba_bancos`) e tradução de categoria da Pluggy
 * (`ba_pluggy_categorias`). Carga em `scripts/bq-load-aux-tables.ts`.
 */
export const SHARED_REFERENCE_TABLES: AllowedDataset[] = [
  { datasetId: 'dataviz_aux', tableIds: ['ba_bancos', 'ba_pluggy_categorias'] },
];

interface Ref {
  projectId?: string;
  datasetId?: string;
  tableId?: string;
}

function isInScope(ref: Ref, allowed: AllowedDataset[], defaultProject: string | undefined): boolean {
  return allowed.some((a) => {
    const project = a.projectId ?? defaultProject;
    if (ref.datasetId !== a.datasetId) return false;
    if (project !== undefined && ref.projectId !== project) return false;
    if (a.tableIds && !a.tableIds.includes(ref.tableId ?? '')) return false;
    return true;
  });
}

/** O pedaço de `statistics.query` do dry-run que interessa ao escopo. */
export interface DryRunReferences {
  referencedTables?: Ref[];
  referencedRoutines?: Array<{ projectId?: string; datasetId?: string; routineId?: string }>;
}

/**
 * Nomes (`dataset.objeto`, com projeto só quando não é o padrão) do que a
 * query lê fora do escopo; vazio =
 * dentro. Rotina (UDF/TVF persistente) só de dataset inteiro liberado — nunca de
 * uma entrada restrita a tabelas: uma função pode ler o que quiser.
 */
export function referencesOutsideScope(
  refs: DryRunReferences | undefined,
  allowed: AllowedDataset[],
  defaultProject: string | undefined,
): string[] {
  // O projeto padrão não entra no nome: a mensagem vai para o modelo, e o id
  // do projeto do app não é informação que ele precise ter.
  const qualifiedName = (projectId: string | undefined, datasetId: string | undefined, objectId: string | undefined) =>
    `${projectId && projectId !== defaultProject ? `${projectId}.` : ''}${datasetId ?? '?'}.${objectId ?? '?'}`;
  const tables = (refs?.referencedTables ?? [])
    .filter((t) => !isInScope(t, allowed, defaultProject))
    .map((t) => qualifiedName(t.projectId, t.datasetId, t.tableId));
  const wholeDatasets = allowed.filter((a) => !a.tableIds);
  const routines = (refs?.referencedRoutines ?? [])
    .filter((r) => !isInScope({ projectId: r.projectId, datasetId: r.datasetId }, wholeDatasets, defaultProject))
    .map((r) => `${qualifiedName(r.projectId, r.datasetId, r.routineId)} (rotina)`);
  return [...tables, ...routines];
}
