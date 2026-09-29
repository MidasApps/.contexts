/* @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
//
// Modelamos o Firestore com o mínimo necessário para o resolver:
//   clients/{id}                                  (doc)
//   metrics/{metricId}                            (doc)
//   dataContracts/{contractId}                    (doc, irrelevante aqui)
//     entities/{entityId}                         (subcol)
//       attributes/{attributeId}                  (subcol)
//
// `getProduct` é mockado direto (product-repo já tem cache próprio).
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => {
  const state = {
    /** clients/{id} → data | undefined (undefined ⇒ doc inexistente). */
    clients: {} as Record<string, Record<string, unknown> | undefined>,
    /** productId → Product | null. */
    products: {} as Record<string, unknown>,
    /** metricId → metric doc data | undefined. */
    metrics: {} as Record<string, Record<string, unknown> | undefined>,
    /**
     * Estrutura aninhada de contracts:
     *   contractId → entityId → { attrId → attrData }
     */
    contracts: {} as Record<
      string,
      Record<string, Record<string, Record<string, unknown>>>
    >,
    /** Quando true, a leitura `clients/{id}` rejeita. */
    throwOnClientRead: false,
    /** metricId cuja leitura `metrics/{id}` deve rejeitar. */
    throwOnMetricId: null as string | null,
    /** Quando true, a consulta por `ownerClientId` rejeita. */
    throwOnOwnerQuery: false,
  };

  function docSnap(data: Record<string, unknown> | undefined, id: string) {
    return {
      id,
      exists: data !== undefined,
      data: () => data,
    };
  }

  const dbInstance = {
    collection: (name: string) => {
      if (name === 'clients') {
        return {
          doc: (id: string) => ({
            get: async () => {
              if (state.throwOnClientRead) throw new Error('firestore unavailable (client read)');
              return docSnap(state.clients[id], id);
            },
          }),
        };
      }
      if (name === 'metrics') {
        return {
          doc: (id: string) => ({
            get: async () => {
              if (state.throwOnMetricId === id) throw new Error(`firestore error reading metric ${id}`);
              return docSnap(state.metrics[id], id);
            },
          }),
          // Métricas do próprio cliente (criadas na conversa) — não vêm de
          // produto, então a única forma de achá-las é pelo dono.
          where: (field: string, _op: string, value: unknown) => ({
            get: async () => {
              if (state.throwOnOwnerQuery) throw new Error('firestore unavailable (owner query)');
              const docs = Object.entries(state.metrics)
                .filter(([, data]) => data?.[field] === value)
                .map(([id, data]) => docSnap(data, id));
              return { docs };
            },
          }),
        };
      }
      if (name === 'dataContracts') {
        return {
          doc: (contractId: string) => ({
            collection: (_sub: string) => {
              // _sub === 'entities'
              return {
                doc: (entityId: string) => ({
                  collection: (_attrs: string) => ({
                    // attributes subcollection .get() → todos os attrs da entity
                    get: async () => {
                      const entity = state.contracts[contractId]?.[entityId] ?? {};
                      return {
                        docs: Object.entries(entity).map(([attrId, data]) =>
                          docSnap(data, attrId),
                        ),
                      };
                    },
                  }),
                }),
              };
            },
          }),
        };
      }
      throw new Error(`Unexpected collection: ${name}`);
    },
  };

  return { state, dbInstance };
});

vi.mock('@/shared/lib/firebase/admin', () => ({
  getDb: vi.fn(() => mocks.dbInstance),
  getAdminFirestore: vi.fn(() => mocks.dbInstance),
  ensureAdminApp: vi.fn(),
}));

vi.mock('@/shared/repositories/product-repo', () => ({
  getProduct: vi.fn(async (id: string) => mocks.state.products[id] ?? null),
}));

import { getClientSemanticContext } from '../client-semantic-context';
import { getProduct } from '@/shared/repositories/product-repo';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
function metric(
  overrides: Partial<{
    label: string;
    description: string | null;
    requires: string[];
    status: string;
  }> = {},
) {
  return {
    label: overrides.label ?? 'Métrica',
    description: overrides.description ?? null,
    requires: overrides.requires ?? ['canonical.contratos.saldo_devedor'],
    type: 'kpi',
    version: '1.0.0',
    status: overrides.status ?? 'active',
    createdAt: null,
    updatedAt: null,
  };
}

function product(
  overrides: Partial<{
    metricRefs: string[];
    entityRefs: string[];
    contractRefs: string[];
  }> = {},
) {
  return {
    id: 'prod',
    name: 'Produto',
    slug: 'prod',
    icon: 'box',
    color: '#fff',
    status: 'active',
    contractRefs: overrides.contractRefs ?? ['canonical'],
    entityRefs: overrides.entityRefs ?? [],
    metricRefs: overrides.metricRefs ?? [],
    indicators: [],
    routes: [],
    createdAt: null,
    updatedAt: null,
  };
}

function binding(
  productId: string,
  enabledIndicators: string[] | null = null,
) {
  return {
    productId,
    datasets: [
      {
        id: 'ds1',
        dataSourceId: 'src1',
        datasetId: 'dataset_x',
        contractRef: 'canonical',
        schemaBindings: {},
        schema: {},
        isPrimary: true,
      },
    ],
    enabledIndicators,
  };
}

describe('getClientSemanticContext', () => {
  beforeEach(() => {
    mocks.state.clients = {};
    mocks.state.products = {};
    mocks.state.metrics = {};
    mocks.state.contracts = {};
    mocks.state.throwOnClientRead = false;
    mocks.state.throwOnMetricId = null;
    mocks.state.throwOnOwnerQuery = false;
    vi.clearAllMocks();
  });

  /**
   * Métrica criada na conversa não pertence a produto nenhum — nasce só com
   * `ownerClientId`. Sem esta busca ela executaria (a rota de dados lê
   * `metrics/{id}` direto) mas sumiria do catálogo no turno seguinte: a IA a
   * criaria, usaria, e na mensagem seguinte diria que o indicador não existe.
   */
  describe('métricas do próprio cliente', () => {
    it('entram no catálogo mesmo sem produto que as surface', async () => {
      mocks.state.products = { prodA: product({ metricRefs: ['pdd.total'] }) };
      mocks.state.metrics = {
        'pdd.total': metric({ label: 'PDD Total' }),
        'chat.preco_medio': { ...metric({ label: 'Preço médio' }), ownerClientId: 'cli' },
        'chat.de_outro': { ...metric({ label: 'De outro cliente' }), ownerClientId: 'outro' },
      };
      mocks.state.clients = { cli: { productBindings: [binding('prodA')] } };

      const ctx = await getClientSemanticContext('cli');

      expect(ctx!.metrics.map((m) => m.id).sort()).toEqual(['chat.preco_medio', 'pdd.total']);
      // Sem produto de origem: o campo fica ausente em vez de mentir um id.
      expect(ctx!.metrics.find((m) => m.id === 'chat.preco_medio')!.productId).toBeUndefined();
    });

    it('não duplica a que já veio por produto', async () => {
      mocks.state.products = { prodA: product({ metricRefs: ['chat.preco_medio'] }) };
      mocks.state.metrics = {
        'chat.preco_medio': { ...metric({ label: 'Preço médio' }), ownerClientId: 'cli' },
      };
      mocks.state.clients = { cli: { productBindings: [binding('prodA')] } };

      const ctx = await getClientSemanticContext('cli');

      expect(ctx!.metrics).toHaveLength(1);
      expect(ctx!.metrics[0]!.productId).toBe('prodA');
    });

    it('ignora a deprecated do dono', async () => {
      mocks.state.products = {};
      mocks.state.metrics = {
        'chat.antiga': { ...metric({ label: 'Antiga', status: 'deprecated' }), ownerClientId: 'cli' },
      };
      mocks.state.clients = { cli: { productBindings: [binding('prodA')] } };

      const ctx = await getClientSemanticContext('cli');

      expect(ctx!.metrics).toEqual([]);
    });

    it('falha na consulta degrada para o catálogo de produto, sem derrubar o contexto', async () => {
      mocks.state.throwOnOwnerQuery = true;
      mocks.state.products = { prodA: product({ metricRefs: ['pdd.total'] }) };
      mocks.state.metrics = { 'pdd.total': metric({ label: 'PDD Total' }) };
      mocks.state.clients = { cli: { productBindings: [binding('prodA')] } };

      const ctx = await getClientSemanticContext('cli');

      expect(ctx!.metrics.map((m) => m.id)).toEqual(['pdd.total']);
    });
  });

  it('cliente sem doc → null', async () => {
    const ctx = await getClientSemanticContext('inexistente');
    expect(ctx).toBeNull();
  });

  it('2 bindings → união dedupada de métricas + contracts', async () => {
    mocks.state.products = {
      prodA: product({
        metricRefs: ['pdd.total', 'carteira.ltv'],
        entityRefs: ['contratos'],
        contractRefs: ['canonical'],
      }),
      prodB: product({
        // carteira.ltv repetida → deve dedupar
        metricRefs: ['carteira.ltv', 'risco.score'],
        entityRefs: ['pagamentos'],
        contractRefs: ['canonical'],
      }),
    };
    mocks.state.metrics = {
      'pdd.total': metric({ label: 'PDD Total', requires: ['canonical.contratos.saldo_devedor'] }),
      'carteira.ltv': metric({ label: 'LTV', requires: ['canonical.contratos.ltv'] }),
      'risco.score': metric({ label: 'Score', requires: ['canonical.pagamentos.score'] }),
    };
    mocks.state.contracts = {
      canonical: {
        contratos: {
          saldo_devedor: { entityId: 'contratos', label: 'Saldo', description: 'd', type: 'NUMERIC' },
          ltv: { entityId: 'contratos', label: 'LTV', description: 'd', type: 'FLOAT64' },
        },
        pagamentos: {
          score: { entityId: 'pagamentos', label: 'Score', description: 'd', type: 'INT64' },
        },
      },
    };
    mocks.state.clients = {
      cli: { productBindings: [binding('prodA'), binding('prodB')] },
    };

    const ctx = await getClientSemanticContext('cli');
    expect(ctx).not.toBeNull();
    expect(ctx!.clientId).toBe('cli');

    const ids = ctx!.metrics.map((m) => m.id).sort();
    expect(ids).toEqual(['carteira.ltv', 'pdd.total', 'risco.score']);
    // dedup: carteira.ltv aparece uma única vez
    expect(ctx!.metrics.filter((m) => m.id === 'carteira.ltv')).toHaveLength(1);

    // productId rastreado
    const pdd = ctx!.metrics.find((m) => m.id === 'pdd.total');
    expect(pdd!.productId).toBe('prodA');
    expect(pdd!.name).toBe('PDD Total');
    expect(pdd!.requires).toEqual(['canonical.contratos.saldo_devedor']);

    // contracts: canonical com as 2 entities, dedupadas
    expect(ctx!.dataContracts).toHaveLength(1);
    const canonical = ctx!.dataContracts[0];
    expect(canonical.contractId).toBe('canonical');
    const entityIds = canonical.entities.map((e) => e.entityId).sort();
    expect(entityIds).toEqual(['contratos', 'pagamentos']);
    const contracts = canonical.entities.find((e) => e.entityId === 'contratos');
    expect(contracts!.attributes.map((a) => a.attributeId).sort()).toEqual(['ltv', 'saldo_devedor']);
  });

  it('enabledIndicators não-null restringe ao subconjunto (intersecção)', async () => {
    mocks.state.products = {
      prodA: product({
        metricRefs: ['pdd.total', 'carteira.ltv', 'risco.score'],
        entityRefs: ['contratos'],
      }),
    };
    mocks.state.metrics = {
      'pdd.total': metric({ label: 'PDD Total' }),
      'carteira.ltv': metric({ label: 'LTV' }),
      'risco.score': metric({ label: 'Score' }),
    };
    mocks.state.contracts = {
      canonical: {
        contratos: {
          saldo_devedor: { entityId: 'contratos', label: 'Saldo', description: '', type: 'NUMERIC' },
        },
      },
    };
    mocks.state.clients = {
      // só pdd.total habilitada; risco.fantasma não existe no produto → ignorada
      cli: { productBindings: [binding('prodA', ['pdd.total', 'risco.fantasma'])] },
    };

    const ctx = await getClientSemanticContext('cli');
    expect(ctx!.metrics.map((m) => m.id)).toEqual(['pdd.total']);
  });

  it('binding cujo produto não existe → ignorado, demais resolvem', async () => {
    mocks.state.products = {
      prodA: product({ metricRefs: ['pdd.total'], entityRefs: ['contratos'] }),
      // prodFantasma ausente → getProduct retorna null
    };
    mocks.state.metrics = {
      'pdd.total': metric({ label: 'PDD Total' }),
    };
    mocks.state.contracts = {
      canonical: {
        contratos: {
          saldo_devedor: { entityId: 'contratos', label: 'Saldo', description: '', type: 'NUMERIC' },
        },
      },
    };
    mocks.state.clients = {
      cli: { productBindings: [binding('prodFantasma'), binding('prodA')] },
    };

    const ctx = await getClientSemanticContext('cli');
    expect(ctx!.metrics.map((m) => m.id)).toEqual(['pdd.total']);
    expect(getProduct).toHaveBeenCalledWith('prodFantasma');
    expect(getProduct).toHaveBeenCalledWith('prodA');
  });

  it('metricRef para métrica deprecated/inexistente → skip, não fatal', async () => {
    mocks.state.products = {
      prodA: product({
        metricRefs: ['pdd.total', 'carteira.ltv', 'risco.orfa'],
        entityRefs: ['contratos'],
      }),
    };
    mocks.state.metrics = {
      'pdd.total': metric({ label: 'PDD Total', status: 'active' }),
      'carteira.ltv': metric({ label: 'LTV', status: 'deprecated' }),
      // risco.orfa ausente
    };
    mocks.state.contracts = {
      canonical: {
        contratos: {
          saldo_devedor: { entityId: 'contratos', label: 'Saldo', description: '', type: 'NUMERIC' },
        },
      },
    };
    mocks.state.clients = {
      cli: { productBindings: [binding('prodA')] },
    };

    const ctx = await getClientSemanticContext('cli');
    expect(ctx!.metrics.map((m) => m.id)).toEqual(['pdd.total']);
  });

  it('sem entityRefs → deriva contracts dos requires[] das métricas', async () => {
    mocks.state.products = {
      prodA: product({
        metricRefs: ['pdd.total'],
        entityRefs: [], // ausente → fallback para requires
      }),
    };
    mocks.state.metrics = {
      'pdd.total': metric({
        label: 'PDD Total',
        requires: ['canonical.contratos.saldo_devedor', 'canonical.contratos.parcela'],
      }),
    };
    mocks.state.contracts = {
      canonical: {
        contratos: {
          saldo_devedor: { entityId: 'contratos', label: 'Saldo', description: '', type: 'NUMERIC' },
          parcela: { entityId: 'contratos', label: 'Parcela', description: '', type: 'NUMERIC' },
        },
      },
    };
    mocks.state.clients = {
      cli: { productBindings: [binding('prodA')] },
    };

    const ctx = await getClientSemanticContext('cli');
    expect(ctx!.dataContracts).toHaveLength(1);
    const contracts = ctx!.dataContracts[0].entities.find((e) => e.entityId === 'contratos');
    expect(contracts!.attributes.map((a) => a.attributeId).sort()).toEqual(['parcela', 'saldo_devedor']);
  });

  it('cliente sem productBindings → contexto vazio (não null)', async () => {
    mocks.state.clients = { cli: { productBindings: [] } };
    const ctx = await getClientSemanticContext('cli');
    expect(ctx).not.toBeNull();
    expect(ctx!.metrics).toEqual([]);
    expect(ctx!.dataContracts).toEqual([]);
  });

  it('leitura do client doc rejeita → retorna null (never-throw)', async () => {
    mocks.state.throwOnClientRead = true;
    mocks.state.clients = { cli: { productBindings: [binding('prodA')] } };

    await expect(getClientSemanticContext('cli')).resolves.toBeNull();
  });

  it('falha de leitura de uma métrica → pula só ela, demais resolvem', async () => {
    mocks.state.products = {
      prodA: product({ metricRefs: ['pdd.total', 'carteira.ltv'], entityRefs: ['contratos'] }),
    };
    mocks.state.metrics = {
      'pdd.total': metric({ label: 'PDD Total' }),
      'carteira.ltv': metric({ label: 'LTV' }),
    };
    mocks.state.contracts = {
      canonical: {
        contratos: {
          saldo_devedor: { entityId: 'contratos', label: 'Saldo', description: '', type: 'NUMERIC' },
        },
      },
    };
    mocks.state.clients = { cli: { productBindings: [binding('prodA')] } };
    // a leitura de carteira.ltv rejeita; pdd.total deve sobreviver
    mocks.state.throwOnMetricId = 'carteira.ltv';

    const ctx = await getClientSemanticContext('cli');
    expect(ctx).not.toBeNull();
    expect(ctx!.metrics.map((m) => m.id)).toEqual(['pdd.total']);
  });

  it('anexa column do schemaBindings por atributo (null quando ausente)', async () => {
    mocks.state.products['prod'] = product({ entityRefs: ['contratos'], contractRefs: ['canonical'], metricRefs: [] });
    mocks.state.clients['c'] = {
      productBindings: [
        {
          productId: 'prod',
          datasets: [
            {
              id: 'ds1', dataSourceId: 'src1', datasetId: 'dataset_x', contractRef: 'canonical',
              schemaBindings: { 'contratos.saldo_devedor': 'vl_saldo_dev' }, schema: {}, isPrimary: true,
            },
          ],
        },
      ],
    };
    mocks.state.contracts['canonical'] = {
      contratos: {
        saldo_devedor: { type: 'float' },
        dias_atraso: { type: 'int' }, // sem binding → column null
      },
    };

    const sc = await getClientSemanticContext('c');
    const attrs = sc!.dataContracts[0].entities[0].attributes;
    const balance = attrs.find((a) => a.attributeId === 'saldo_devedor');
    const delinquency = attrs.find((a) => a.attributeId === 'dias_atraso');
    expect(balance!.column).toBe('vl_saldo_dev');
    expect(delinquency!.column).toBeNull();
  });

  it('recipe é repassado bruto na métrica que o possui', async () => {
    const recipe = { kind: 'aggregation', primaryEntity: 'contratos', aggregation: 'sum', valueAttribute: 'contratos.saldo_devedor', groupByAttributes: [], filters: [] };
    mocks.state.products = {
      prodA: product({ metricRefs: ['pdd.total', 'carteira.label_only'], entityRefs: ['contratos'] }),
    };
    mocks.state.metrics = {
      'pdd.total': { ...metric({ label: 'PDD Total' }), recipe },
      // sem recipe → label-only
      'carteira.label_only': metric({ label: 'Label Only' }),
    };
    mocks.state.contracts = {
      canonical: {
        contratos: {
          saldo_devedor: { entityId: 'contratos', label: 'Saldo', description: '', type: 'NUMERIC' },
        },
      },
    };
    mocks.state.clients = { cli: { productBindings: [binding('prodA')] } };

    const ctx = await getClientSemanticContext('cli');
    const pdd = ctx!.metrics.find((m) => m.id === 'pdd.total');
    const labelOnly = ctx!.metrics.find((m) => m.id === 'carteira.label_only');
    expect(pdd!.recipe).toEqual(recipe);
    expect(labelOnly!.recipe).toBeUndefined();
  });

  it('carrega shape/outputColumns; shape desconhecido e doc sem os campos viram undefined', async () => {
    mocks.state.products = {
      prodA: product({
        metricRefs: ['covenants.rating_serie', 'covenants.legado', 'covenants.shape_torto'],
        entityRefs: ['contratos'],
      }),
    };
    mocks.state.metrics = {
      'covenants.rating_serie': {
        ...metric({ label: 'Rating' }),
        shape: 'timeseries_pivot',
        outputColumns: ['bucket', 'a', 'b'],
      },
      // Documento anterior ao backfill — sem os campos novos.
      'covenants.legado': metric({ label: 'Legado' }),
      // Valor gravado fora do enum: pior que ausente no prompt, então é descartado.
      'covenants.shape_torto': { ...metric({ label: 'Torto' }), shape: 'planilha', outputColumns: [] },
    };
    mocks.state.contracts = {
      canonical: { contratos: { saldo_devedor: { type: 'NUMERIC' } } },
    };
    mocks.state.clients = { cli: { productBindings: [binding('prodA')] } };

    const ctx = await getClientSemanticContext('cli');
    const byId = (id: string) => ctx!.metrics.find((m) => m.id === id)!;

    expect(byId('covenants.rating_serie').shape).toBe('timeseries_pivot');
    expect(byId('covenants.rating_serie').outputColumns).toEqual(['bucket', 'a', 'b']);

    expect(byId('covenants.legado').shape).toBeUndefined();
    expect(byId('covenants.legado').outputColumns).toBeUndefined();

    expect(byId('covenants.shape_torto').shape).toBeUndefined();
    expect(byId('covenants.shape_torto').outputColumns).toBeUndefined();
  });
  /**
   * ADR-0026 — sem `filterFields` aqui, `list_page_fields` devolveria lista
   * vazia para toda página e o assistente voltaria a garimpar coluna no
   * contrato do cliente, que foi como o filtro de banco acabou apontando para
   * uma coluna NULL.
   */
  it('carrega filterFields; doc sem o campo vira undefined', async () => {
    mocks.state.products = {
      prodA: product({ metricRefs: ['covenants.extrato', 'covenants.legado'], entityRefs: ['contratos'] }),
    };
    mocks.state.metrics = {
      'covenants.extrato': {
        ...metric({ label: 'Extrato' }),
        filterFields: { banco: { expr: 'b.nome_reduzido', field: 'banco', label: 'Banco' } },
      },
      'covenants.legado': metric({ label: 'Legado' }),
    };
    mocks.state.contracts = { canonical: { contratos: { saldo_devedor: { type: 'NUMERIC' } } } };
    mocks.state.clients = { cli: { productBindings: [binding('prodA')] } };

    const ctx = await getClientSemanticContext('cli');
    const byId = (id: string) => ctx!.metrics.find((m) => m.id === id)!;

    expect(byId('covenants.extrato').filterFields).toEqual({
      banco: { expr: 'b.nome_reduzido', field: 'banco', label: 'Banco' },
    });
    expect(byId('covenants.legado').filterFields).toBeUndefined();
  });
});
