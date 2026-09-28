import { loadClientBindings } from '@/shared/lib/metrics/execute-metric';
import { getDataSource } from '@/shared/repositories/data-source-repo';
import { singleDatasetScope, type QueryScope } from './tenant-query';
import { SHARED_REFERENCE_TABLES, type AllowedDataset } from '@/shared/lib/bigquery/query-scope';

// Reexportada: a lista vive em `shared/lib/bigquery/query-scope.ts` (fonte única).
export { SHARED_REFERENCE_TABLES };

/**
 * Onde o SQL escrito pelo modelo pode ler, para um cliente (ADR-0006).
 *
 * `defaultDataset` resolve nome não qualificado, mas não impede nome
 * qualificado: `FROM imobiliaria_demo.vendas` lia a carteira de outro tenant
 * pelo `execute_sql` do Vila Rosa. O escopo é a lista que o dry-run confere
 * (`checkTenantQuery`): cada tabela e rotina referenciada precisa estar aqui.
 *
 * A lista vem do SERVIDOR, nunca do input do modelo:
 * - o dataset que a rota autorizou (`verifyDatasetAccess`);
 * - os datasets VINCULADOS ao cliente (`clients/{id}.productBindings[].datasets[]`),
 *   com o projeto do seu dataSource — um cliente pode ter mais de um produto, e
 *   juntar os dois (monitor + covenants no Vila Rosa) é uso legítimo;
 * - as tabelas de referência compartilhadas (`SHARED_REFERENCE_TABLES`).
 *
 * Se a leitura dos bindings falhar, o escopo ESTREITA para o dataset da rota:
 * falha nunca alarga o que a query pode ler.
 */

const boundDatasets = async (clientId: string): Promise<AllowedDataset[]> => {
  const loaded = await loadClientBindings(clientId);
  if (!loaded.ok) return [];
  const out: AllowedDataset[] = [];
  for (const binding of loaded.bindings) {
    for (const ds of binding.datasets ?? []) {
      if (!ds?.dataSourceId || !ds.datasetId) continue;
      const source = await getDataSource(ds.dataSourceId);
      // Sem dataSource não há projeto confiável: fica de fora.
      if (!source?.projectId) continue;
      out.push({ projectId: source.projectId, datasetId: ds.datasetId });
    }
  }
  return out;
};

export const resolveClientQueryScope = async (args: {
  clientId?: string;
  /** Dataset que a rota autorizou para este request. */
  dataset: string;
}): Promise<QueryScope> => {
  const base = singleDatasetScope(args.dataset);
  let bound: AllowedDataset[] = [];
  if (args.clientId) {
    try {
      bound = await boundDatasets(args.clientId);
    } catch {
      bound = [];
    }
  }
  return {
    defaultDataset: args.dataset,
    allowed: [...(base.allowed ?? []), ...bound, ...SHARED_REFERENCE_TABLES],
  };
};

/**
 * O mesmo escopo, resolvido uma vez por instância de tool (o registry cria as
 * tools por request) e reaproveitado nas chamadas seguintes do mesmo request.
 */
export const lazyClientQueryScope = (args: { clientId?: string; dataset: string }): () => Promise<QueryScope> => {
  let pending: Promise<QueryScope> | undefined;
  return () => (pending ??= resolveClientQueryScope(args));
};

/**
 * Escopo de uma entrada do catálogo de SQL validado (rotas de admin).
 *
 * O SQL aprovado ali vira exemplo que o modelo daquele cliente recupera e
 * roda. Ele é validado como o `execute_sql` o validaria: dataset padrão e
 * escopo vêm dos datasets VINCULADOS ao cliente da entrada — não há rota de
 * chat autorizando dataset aqui. Sem dataset vinculado, `null`: quem chama
 * recusa (fail closed).
 */
export const catalogQueryScope = async (clientId: string): Promise<QueryScope | null> => {
  let bound: AllowedDataset[];
  try {
    bound = await boundDatasets(clientId);
  } catch {
    return null;
  }
  const primary = bound[0];
  if (!primary?.projectId) return null;
  return {
    defaultDataset: `${primary.projectId}.${primary.datasetId}`,
    allowed: [...bound, ...SHARED_REFERENCE_TABLES],
  };
};
