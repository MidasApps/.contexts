import { describe, it, expect } from 'vitest';
import {
  RetrievedChunkSchema,
  DashboardTemplateSchema,
  BusinessContextSchema,
} from './types';

const validChunk = {
  id: 'c1',
  score: 0.85,
  text: 'CRI lastreado em recebíveis...',
  metadata: {
    clientId: 'vila-rosa',
    sourceDoc: 'docs/benchmarking/2 1 CRI CRA.md',
    themes: ['regulatorio'],
  },
};

const validTemplate = {
  id: 'diretor-fii-cri-vila-rosa',
  persona: 'diretor-fii-cri',
  client: 'vila-rosa',
  kpis: [
    { key: 'oc', label: 'Overcollateralization', priority: 'critical' as const },
    { key: 'es', label: 'Excess Spread', priority: 'critical' as const },
    { key: 'wal', label: 'WAL', priority: 'high' as const },
  ],
  visuals: [{ type: 'kpi', title: 'KPIs', kpis: ['oc'] }],
};

describe('RetrievedChunkSchema', () => {
  it('requires id, score, text, metadata.clientId', () => {
    expect(() => RetrievedChunkSchema.parse(validChunk)).not.toThrow();
  });
  // Não é lista de clientes conhecidos (isso é cadastro da admin) — é formato:
  // `XYZ` cai por ser maiúsculo, e `a.b` por conter o separador que escaparia
  // de um nome de dataset.
  it('rejects clientId fora do formato de slug', () => {
    for (const bad of ['XYZ', 'a.b', 'a b', '']) {
      expect(() =>
        RetrievedChunkSchema.parse({ ...validChunk, metadata: { ...validChunk.metadata, clientId: bad } }),
      ).toThrow();
    }
  });
  it('rejects score out of range', () => {
    expect(() =>
      RetrievedChunkSchema.parse({ ...validChunk, score: 1.5 }),
    ).toThrow();
  });
});

describe('DashboardTemplateSchema', () => {
  it('requires kpis≥3 and visuals≥1', () => {
    expect(() => DashboardTemplateSchema.parse(validTemplate)).not.toThrow();
    expect(() =>
      DashboardTemplateSchema.parse({ ...validTemplate, kpis: validTemplate.kpis.slice(0, 2) }),
    ).toThrow();
    expect(() =>
      DashboardTemplateSchema.parse({ ...validTemplate, visuals: [] }),
    ).toThrow();
  });

  it('validates kpi shape', () => {
    expect(() =>
      DashboardTemplateSchema.parse({
        ...validTemplate,
        kpis: [{ key: 'x', label: 'X', priority: 'invalid' }, ...validTemplate.kpis.slice(1)],
      }),
    ).toThrow();
  });

  it('rejects unknown client', () => {
    expect(() =>
      DashboardTemplateSchema.parse({ ...validTemplate, client: 'XYZ' }),
    ).toThrow();
  });
});

describe('BusinessContextSchema', () => {
  it('composes static + retrieved + macro + template + retrievalMeta', () => {
    const out = BusinessContextSchema.parse({
      static: { client: { id: 'vila-rosa' }, persona: { id: 'cfo' }, icp: null },
      retrieved: [validChunk],
      macro: { source: 'BCB_SGS' },
      template: validTemplate,
      glossaryVersion: '2026-05-04',
      retrievalMeta: { latencyMs: 100, cacheHit: false, source: 'rag' },
    });
    expect(out.retrieved).toHaveLength(1);
    expect(out.template?.id).toBe('diretor-fii-cri-vila-rosa');
  });

  it('accepts template=null', () => {
    expect(() =>
      BusinessContextSchema.parse({
        static: {},
        retrieved: [],
        macro: {},
        template: null,
        glossaryVersion: '2026-05-04',
        retrievalMeta: { latencyMs: 0, cacheHit: false, source: 'fallback' },
      }),
    ).not.toThrow();
  });
});
