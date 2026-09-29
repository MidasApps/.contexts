import type { ClientDatasetLookup } from './client-doc.schema';

/** Um doc de cliente "possui" o dataset se ele bater com qualquer formato: legado ou binding. */
export function matchClientDataset(data: ClientDatasetLookup, dataset: string): boolean {
  if (data.dataset === dataset) return true;
  if (Array.isArray(data.datasets) && data.datasets.some((d) => d?.dataset === dataset)) return true;
  for (const pb of data.productBindings ?? []) {
    for (const d of pb?.datasets ?? []) {
      if (!d?.datasetId) continue;
      if (d.datasetId === dataset) return true;
      if (d.dataSourceId && `${d.dataSourceId}.${d.datasetId}` === dataset) return true;
    }
  }
  return false;
}
