import type { ClientDatasetBinding } from '@/shared/schemas';

/**
 * Cria um dataset binding vazio para a Admin. O `contractRef` vem do produto
 * (contrato real, ex.: `liquid-play`), nunca o literal `'canonical'` — que
 * apontava para um contrato inexistente e fazia a resolução de métrica
 * falhar com 422 (G2 da auditoria).
 */
export function makeDatasetBinding(opts: {
  contractRef: string;
  dataSourceId?: string;
  index?: number;
}): ClientDatasetBinding {
  const index = opts.index ?? 0;
  return {
    id: index === 0 ? 'main' : `secondary-${index}`,
    dataSourceId: opts.dataSourceId ?? '',
    datasetId: '',
    contractRef: opts.contractRef,
    schemaBindings: {},
    schema: {},
    lastSchemaSync: null,
    isPrimary: index === 0,
  };
}
