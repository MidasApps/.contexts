import { describe, it, expect } from 'vitest';
import { metricUsages, countReferences, usedOutside } from './metric-usages';

type Doc = { id: string; data: () => Record<string, unknown> };

function makeDb(structure: Record<string, Record<string, Record<string, unknown>>>) {
  const reads: string[] = [];
  const grupos: Doc[] = Object.keys(structure).map((id) => ({ id, data: () => ({}) }));

  const db = {
    collection: () => ({
      doc: () => ({
        collection: () => ({
          get: async () => ({ docs: grupos }),
          doc: (groupId: string) => ({
            collection: () => ({
              get: async () => {
                reads.push(groupId);
                return {
                  docs: Object.entries(structure[groupId] ?? {}).map(([id, data]) => ({
                    id,
                    data: () => data,
                  })),
                };
              },
            }),
          }),
        }),
      }),
    }),
  } as unknown as FirebaseFirestore.Firestore;

  return { db, leituras: reads };
}

describe('countReferences', () => {
  it('acha o metricId do bloco', () => {
    const blockMap = { b1: { type: 'kpi', metricId: 'chat.x' }, b2: { type: 'kpi', metricId: 'covenants.y' } };
    expect(countReferences(blockMap, 'chat.x')).toBe(1);
  });

  it('acha também a métrica da sparkline — é outro campo, na mesma família', () => {
    const blockMap = { b1: { type: 'kpi', metricId: 'covenants.y', sparklineMetricId: 'chat.x' } };
    expect(countReferences(blockMap, 'chat.x')).toBe(1);
  });

  it('desce em listas e objetos aninhados', () => {
    const blockMap = { b1: { rows: [{ metricId: 'chat.x' }, { metricId: 'chat.x' }] } };
    expect(countReferences(blockMap, 'chat.x')).toBe(2);
  });

  it('não confunde o id em campo que não é de métrica', () => {
    expect(countReferences({ b1: { title: 'chat.x', metricId: 'outra' } }, 'chat.x')).toBe(0);
  });

  it('aguenta documento sem blockMap', () => {
    expect(countReferences(undefined, 'chat.x')).toBe(0);
  });
});

describe('metricUsages', () => {
  it('lista as páginas que apontam para a métrica, com nome e quantos blocos', async () => {
    const { db } = makeDb({
      covenants: {
        capa: { name: 'Capa', blockMap: { b1: { metricId: 'chat.x' }, b2: { metricId: 'chat.x' } } },
        outra: { name: 'Outra', blockMap: { b1: { metricId: 'covenants.z' } } },
      },
      operacional: {
        fluxo: { name: 'Fluxo', blockMap: { b1: { metricId: 'chat.x' } } },
      },
    });

    const uses = await metricUsages(db, 'vila-rosa', 'chat.x');

    expect(uses).toEqual([
      { groupId: 'covenants', reportId: 'capa', reportName: 'Capa', blocos: 2 },
      { groupId: 'operacional', reportId: 'fluxo', reportName: 'Fluxo', blocos: 1 },
    ]);
  });

  it('devolve vazio quando ninguém usa', async () => {
    const { db } = makeDb({ covenants: { capa: { name: 'Capa', blockMap: {} } } });
    expect(await metricUsages(db, 'vila-rosa', 'chat.x')).toEqual([]);
  });
});

describe('usedOutside', () => {
  const usage = (groupId: string, reportId: string) => ({ groupId, reportId, reportName: reportId, blocos: 1 });

  it('só a página aberta usa ⇒ não está em uso fora', () => {
    expect(usedOutside([usage('g', 'r')], { groupId: 'g', reportId: 'r' })).toBe(false);
  });

  it('outra página do mesmo relatório conta como uso fora', () => {
    expect(usedOutside([usage('g', 'r'), usage('g', 'r2')], { groupId: 'g', reportId: 'r' })).toBe(true);
  });

  it('sem saber qual página está aberta, qualquer uso conta', () => {
    expect(usedOutside([usage('g', 'r')], {})).toBe(true);
  });
});
