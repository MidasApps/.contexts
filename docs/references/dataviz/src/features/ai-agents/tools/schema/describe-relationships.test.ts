import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
const getMetadataMock = vi.fn();

vi.mock('@/shared/lib/bigquery/client', () => ({
  getBigQueryClient: () => ({
    query: queryMock,
    dataset: () => ({
      table: () => ({ getMetadata: getMetadataMock }),
    }),
  }),
}));

describe('createDescribeRelationshipsTool', () => {
  beforeEach(() => {
    queryMock.mockReset();
    getMetadataMock.mockReset();
  });

  it('detects fk via *_id convention with sample JOIN', async () => {
    getMetadataMock
      .mockResolvedValueOnce([
        {
          schema: {
            fields: [
              { name: 'id', type: 'STRING' },
              { name: 'cliente_id', type: 'STRING' },
            ],
          },
        },
      ])
      .mockResolvedValueOnce([
        { schema: { fields: [{ name: 'id', type: 'STRING' }] } },
      ]);
    queryMock.mockResolvedValueOnce([[{ hits: 850 }]]);
    const { createDescribeRelationshipsTool, __resetRelationshipsCache } = await import(
      './describe-relationships'
    );
    __resetRelationshipsCache();
    const tool = createDescribeRelationshipsTool({ dataset: 'liquid_om', clientId: 'om' });
    const out = (await tool.execute!(
      { tables: ['contratos', 'clientes'] },
      { toolCallId: 't', messages: [] } as never,
    )) as { edges: Array<{ from: string; to: string; confidence: number }>; cacheHit: boolean };
    expect(out.edges).toHaveLength(1);
    expect(out.edges[0]!.from).toBe('contratos');
    expect(out.edges[0]!.to).toBe('clientes');
    expect(out.edges[0]!.confidence).toBeCloseTo(0.85, 2);
    expect(out.cacheHit).toBe(false);
  });

  it('returns cached result on second call', async () => {
    getMetadataMock.mockResolvedValueOnce([
      { schema: { fields: [{ name: 'id', type: 'STRING' }] } },
    ]);
    const { createDescribeRelationshipsTool, __resetRelationshipsCache } = await import(
      './describe-relationships'
    );
    __resetRelationshipsCache();
    const tool = createDescribeRelationshipsTool({ dataset: 'liquid_om', clientId: 'om' });
    await tool.execute!({ tables: ['x'] }, { toolCallId: 't', messages: [] } as never);
    const out2 = (await tool.execute!(
      { tables: ['x'] },
      { toolCallId: 't', messages: [] } as never,
    )) as { cacheHit: boolean };
    expect(out2.cacheHit).toBe(true);
    // getMetadata only called on first invocation
    expect(getMetadataMock).toHaveBeenCalledTimes(1);
  });

  it('skips tables that fail metadata lookup', async () => {
    getMetadataMock.mockRejectedValueOnce(new Error('no perms'));
    const { createDescribeRelationshipsTool, __resetRelationshipsCache } = await import(
      './describe-relationships'
    );
    __resetRelationshipsCache();
    const tool = createDescribeRelationshipsTool({ dataset: 'liquid_om', clientId: 'om' });
    const out = (await tool.execute!(
      { tables: ['mystery'] },
      { toolCallId: 't', messages: [] } as never,
    )) as { edges: unknown[] };
    expect(out.edges).toHaveLength(0);
  });
});
