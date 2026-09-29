import { DEFAULT_FILTER_SOURCE, type FilterSource } from '@/shared/lib/bigquery/filter-source';
import type { ClientDatasetLookup, DatasetBinding } from './client-doc.schema';

interface Candidate extends FilterSource {
  entity: string;
}

const toCandidates = (binding: DatasetBinding): Candidate[] => {
  const schemaBindings = binding.schemaBindings ?? {};
  return Object.entries(binding.tableBindings ?? {}).flatMap(([entity, table]) => {
    const dateField = schemaBindings[`${entity}.data_base_report`];
    if (typeof dateField !== 'string') return [];
    const projectField = schemaBindings[`${entity}.projeto`];
    return [{ entity, table, dateField, projectField: typeof projectField === 'string' ? projectField : null }];
  });
};

/**
 * Which table feeds this client's period selector.
 *
 * Rule: inside the requested dataset (`project.dataset` or `dataset`), the first
 * bound entity that maps the `data_base_report` attribute — `contratos` first,
 * for backward compatibility with the securitization domain. `projeto` is only
 * used when the same entity maps it. Without bindings for the requested dataset
 * (legacy client, or a dataset bound only in the legacy fields) the old literal
 * applies — a table bound in another dataset may not exist in this one.
 */
export const resolveDateSource = (client: ClientDatasetLookup | undefined, dataset: string): FilterSource => {
  const target = dataset.split('.').pop() ?? dataset;
  const datasets = (client?.productBindings ?? []).flatMap((product) => product.datasets ?? []);
  const datasetBindings = datasets.filter(
    (binding) => binding.datasetId === target || `${binding.dataSourceId}.${binding.datasetId}` === dataset,
  );
  const candidates = datasetBindings.flatMap(toCandidates);
  const chosen = candidates.find((candidate) => candidate.entity === 'contratos') ?? candidates[0];
  if (!chosen) return DEFAULT_FILTER_SOURCE;
  return { table: chosen.table, dateField: chosen.dateField, projectField: chosen.projectField };
};
