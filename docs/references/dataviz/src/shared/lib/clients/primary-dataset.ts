import type { ClientConfig } from '@/shared/stores/app-store';

/**
 * O dataset "principal" de um cliente — o que o chat manda como `dataset`.
 *
 * Função pura para servir aos dois lados: o hook `useActiveDataset` (navegador)
 * e o playground local do Mastra (`src/mastra/`), que monta o mesmo contexto
 * de agente sem passar pelo navegador. Duas cópias desta ordem divergiriam, e o
 * playground testaria um dataset que o produto nunca manda.
 *
 * Ordem de resolução:
 *   1. legado `client.datasets[0].dataset` (deprecated, sendo migrado)
 *   2. legado `client.dataset`
 *   3. primeiro dataset do primeiro productBinding (modelo novo)
 */
export function primaryDatasetOf(
  client: Pick<ClientConfig, 'datasets' | 'dataset' | 'productBindings'>,
): string | null {
  if (client.datasets && client.datasets[0]?.dataset) return client.datasets[0].dataset;
  if (client.dataset) return client.dataset;
  const firstBinding = client.productBindings?.[0];
  const firstDs = firstBinding?.datasets?.[0];
  if (!firstDs) return null;
  // ProductBindings têm `dataSourceId` + `datasetId`; o backend espera "projeto.dataset"
  // ou apenas "dataset". Concatena se ambos existirem.
  if (firstDs.dataSourceId && firstDs.datasetId) {
    return `${firstDs.dataSourceId}.${firstDs.datasetId}`;
  }
  return firstDs.datasetId ?? null;
}
