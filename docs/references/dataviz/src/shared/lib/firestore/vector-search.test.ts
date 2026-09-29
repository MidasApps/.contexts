import { describe, it, expect, vi } from 'vitest';
import { vectorSearch } from './vector-search';

/**
 * Mock CollectionReference factory: holds a list of docs, supports `where`
 * chaining, and `.get()` returning matching docs only.
 */
interface MockDoc {
  id: string;
  data: Record<string, unknown>;
}

function makeCollection(docs: MockDoc[]) {
  const whereCalls: Array<[string, string, unknown]> = [];

  const buildQuery = (filtered: MockDoc[]) => ({
    where: vi.fn((field: string, op: string, value: unknown) => {
      whereCalls.push([field, op, value]);
      const next = filtered.filter((d) => {
        if (op === 'in') return Array.isArray(value) && (value as unknown[]).includes(d.data[field]);
        if (op === '==') return d.data[field] === value;
        return true;
      });
      return buildQuery(next);
    }),
    get: vi.fn(async () => ({
      empty: filtered.length === 0,
      docs: filtered.map((d) => ({
        id: d.id,
        data: () => d.data,
      })),
      size: filtered.length,
    })),
  });

  const root = buildQuery(docs);
  return { collection: root, whereCalls };
}

describe('vectorSearch', () => {
  it('returns top-K results ordered by cosine similarity desc', async () => {
    // q = [1, 0]; docs aligned with [1,0] should rank highest.
    const docs: MockDoc[] = [
      { id: 'a', data: { embedding: [1, 0], clientId: 'OM' } },        // cos = 1
      { id: 'b', data: { embedding: [0.9, 0.1], clientId: 'OM' } },    // cos high
      { id: 'c', data: { embedding: [0, 1], clientId: 'OM' } },        // cos = 0
      { id: 'd', data: { embedding: [-1, 0], clientId: 'OM' } },       // cos = -1
      { id: 'e', data: { embedding: [0.5, 0.5], clientId: 'OM' } },    // cos ~ 0.707
    ];
    const { collection } = makeCollection(docs);

    const out = await vectorSearch({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      collection: collection as any,
      queryEmbedding: [1, 0],
      filters: { clientId: 'OM' },
      topK: 3,
    });

    expect(out).toHaveLength(3);
    expect(out[0]!.id).toBe('a');
    expect(out[1]!.id).toBe('b');
    expect(out[2]!.id).toBe('e');
    expect(out[0]!.score).toBeGreaterThan(out[1]!.score);
    expect(out[1]!.score).toBeGreaterThan(out[2]!.score);
  });

  it('applies filters via where clauses on the collection', async () => {
    const docs: MockDoc[] = [
      { id: 'a', data: { embedding: [1, 0], clientId: 'OM' } },
      { id: 'b', data: { embedding: [1, 0], clientId: 'BRZ' } },
    ];
    const { collection, whereCalls } = makeCollection(docs);

    const out = await vectorSearch({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      collection: collection as any,
      queryEmbedding: [1, 0],
      filters: { clientId: 'OM' },
      topK: 5,
    });

    expect(whereCalls).toContainEqual(['clientId', '==', 'OM']);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe('a');
  });

  it('returns empty array when no docs match', async () => {
    const { collection } = makeCollection([]);
    const out = await vectorSearch({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      collection: collection as any,
      queryEmbedding: [1, 0],
      filters: { clientId: 'OM' },
      topK: 5,
    });
    expect(out).toEqual([]);
  });

  it('honors custom embeddingField', async () => {
    const docs: MockDoc[] = [
      { id: 'a', data: { vec: [1, 0], clientId: 'OM' } },
      { id: 'b', data: { vec: [0, 1], clientId: 'OM' } },
    ];
    const { collection } = makeCollection(docs);
    const out = await vectorSearch({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      collection: collection as any,
      queryEmbedding: [1, 0],
      filters: { clientId: 'OM' },
      topK: 5,
      embeddingField: 'vec',
    });
    expect(out[0]!.id).toBe('a');
    expect(out[0]!.score).toBeCloseTo(1);
  });

  it('skips docs missing the embedding field', async () => {
    const docs: MockDoc[] = [
      { id: 'a', data: { embedding: [1, 0], clientId: 'OM' } },
      { id: 'b', data: { clientId: 'OM' } }, // no embedding
    ];
    const { collection } = makeCollection(docs);
    const out = await vectorSearch({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      collection: collection as any,
      queryEmbedding: [1, 0],
      filters: { clientId: 'OM' },
      topK: 5,
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe('a');
  });

  it('aplica == para valor escalar', async () => {
    const A = [1, 0, 0];
    const B = [0, 1, 0];
    const docs: MockDoc[] = [
      { id: '1', data: { knowledgeBaseId: 'k1', embedding: A } },
      { id: '2', data: { knowledgeBaseId: 'k2', embedding: B } },
    ];
    const { collection } = makeCollection(docs);
    const out = await vectorSearch({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      collection: collection as any,
      queryEmbedding: A,
      filters: { knowledgeBaseId: 'k1' },
      topK: 5,
    });
    expect(out.map((m) => m.id)).toEqual(['1']);
  });

  it('aplica in para valor array', async () => {
    const A = [1, 0, 0];
    const B = [0, 1, 0];
    const docs: MockDoc[] = [
      { id: '1', data: { knowledgeBaseId: 'k1', embedding: A } },
      { id: '2', data: { knowledgeBaseId: 'k2', embedding: B } },
      { id: '3', data: { knowledgeBaseId: 'k3', embedding: A } },
    ];
    const { collection } = makeCollection(docs);
    const out = await vectorSearch({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      collection: collection as any,
      queryEmbedding: A,
      filters: { knowledgeBaseId: ['k1', 'k3'] },
      topK: 5,
    });
    expect(out.map((m) => m.id).sort()).toEqual(['1', '3']);
  });

  it('array vazio em in não casa nada', async () => {
    const A = [1, 0, 0];
    const docs: MockDoc[] = [{ id: '1', data: { knowledgeBaseId: 'k1', embedding: A } }];
    const { collection } = makeCollection(docs);
    const out = await vectorSearch({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      collection: collection as any,
      queryEmbedding: A,
      filters: { knowledgeBaseId: [] },
      topK: 5,
    });
    expect(out).toEqual([]);
  });
});
