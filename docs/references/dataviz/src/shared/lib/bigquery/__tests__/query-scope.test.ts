import { describe, it, expect } from 'vitest';
import { referencesOutsideScope, SHARED_REFERENCE_TABLES } from '../query-scope';

const allowed = [{ projectId: 'app-proj', datasetId: 'cliente_ds' }, ...SHARED_REFERENCE_TABLES];
const t = (projectId: string, datasetId: string, tableId: string) => ({ projectId, datasetId, tableId });

describe('referencesOutsideScope', () => {
  it('vazio quando tudo está nos datasets do cliente ou nas tabelas compartilhadas', () => {
    expect(referencesOutsideScope(
      { referencedTables: [t('app-proj', 'cliente_ds', 'x'), t('app-proj', 'dataviz_aux', 'ba_bancos')] },
      allowed,
      'app-proj',
    )).toEqual([]);
  });

  it('nomeia o que está fora sem expor o projeto padrão', () => {
    expect(referencesOutsideScope(
      { referencedTables: [t('app-proj', 'outro_ds', 'vendas'), t('bigquery-public-data', 'samples', 'shakespeare')] },
      allowed,
      'app-proj',
    )).toEqual(['outro_ds.vendas', 'bigquery-public-data.samples.shakespeare']);
  });

  it('tabela compartilhada é por tabela: resto do dataset, wildcard e INFORMATION_SCHEMA ficam fora', () => {
    expect(referencesOutsideScope(
      { referencedTables: [t('app-proj', 'dataviz_aux', 'outra'), t('app-proj', 'dataviz_aux', '*'), t('app-proj', 'dataviz_aux', 'INFORMATION_SCHEMA.TABLES')] },
      allowed,
      'app-proj',
    )).toHaveLength(3);
  });

  it('rotina só de dataset inteiro liberado — nunca do dataset de referência', () => {
    expect(referencesOutsideScope(
      { referencedRoutines: [{ projectId: 'app-proj', datasetId: 'dataviz_aux', routineId: 'f' }, { projectId: 'app-proj', datasetId: 'cliente_ds', routineId: 'g' }] },
      allowed,
      'app-proj',
    )).toEqual(['dataviz_aux.f (rotina)']);
  });
});
