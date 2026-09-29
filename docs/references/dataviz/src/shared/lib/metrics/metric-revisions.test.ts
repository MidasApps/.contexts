import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase-admin/firestore', () => ({ Timestamp: { now: () => ({ s: 0 }) } }));

import { archiveRevision, latestRevision } from './metric-revisions';

function makeDb(revisions: Array<Record<string, unknown>> = []) {
  const add = vi.fn(async (..._a: unknown[]) => undefined);
  const ordem: string[] = [];
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => ({
        collection: (sub: string) => {
          ordem.push(`${name}/${id}/${sub}`);
          return {
            add,
            orderBy: (field: string, dir: string) => {
              ordem.push(`orderBy:${field}:${dir}`);
              return {
                limit: (n: number) => ({
                  get: async () => ({
                    docs: revisions.slice(0, n).map((r) => ({ data: () => r })),
                  }),
                }),
              };
            },
          };
        },
      }),
    }),
  } as unknown as FirebaseFirestore.Firestore;
  return { db, add, ordem };
}

const currentDoc = { label: 'Vendas', version: '1.0.1', recipe: { kind: 'sql', template: 'SELECT 1' } };

describe('archiveRevision', () => {
  it('guarda o documento inteiro, com versão, autor e momento', async () => {
    const { db, add, ordem } = makeDb();

    await archiveRevision({ db, metricId: 'chat.vendas', doc: currentDoc, email: 'u@e.com' });

    expect(ordem[0]).toBe('metrics/chat.vendas/revisions');
    expect(add).toHaveBeenCalledWith({
      version: '1.0.1',
      doc: currentDoc,
      archivedAt: { s: 0 },
      archivedBy: 'u@e.com',
    });
  });

  /**
   * O documento inteiro, e não um diff: o registro precisa se bastar para
   * restaurar, e diff exigiria a cadeia completa desde o começo — que não
   * existe para as métricas que já estão no catálogo.
   */
  it('aceita documento sem versão declarada', async () => {
    const { db, add } = makeDb();

    await archiveRevision({ db, metricId: 'chat.x', doc: { label: 'Antiga' }, email: 'u@e.com' });

    expect((add.mock.calls[0]![0] as { version: unknown }).version).toBeNull();
  });
});

describe('latestRevision', () => {
  it('devolve a mais recente — é para onde um desfazer volta', async () => {
    const { db, ordem } = makeDb([{ version: '1.0.1', doc: currentDoc, archivedAt: { s: 0 }, archivedBy: 'u@e.com' }]);

    const r = await latestRevision(db, 'chat.vendas');

    expect(r?.version).toBe('1.0.1');
    expect(ordem).toContain('orderBy:archivedAt:desc');
  });

  it('sem histórico devolve null, em vez de fingir uma revisão vazia', async () => {
    const { db } = makeDb([]);
    expect(await latestRevision(db, 'chat.vendas')).toBeNull();
  });
});
