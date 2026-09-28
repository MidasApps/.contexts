import { describe, it, expect } from 'vitest';
import { buildAgentSystem } from './build-system';
import type { BusinessContext } from '@/shared/config/business-context';
import type { MacroSnapshot } from '@/shared/lib/macro/bcb-sgs';
import type { BusinessContext as RetrievedBusinessContext } from '@/features/business-context/types';

// Perfil no formato novo (plano), vindo de `clients/{id}.businessProfile`.
const mockClient = {
  dominantProduct: 'CRI MCMV',
  avgLtv: 0.72,
  wal: 4.2,
  ocTarget: 0.15,
  tablesPreferred: ['carteira_contratos'],
  partitionKey: 'data_emissao',
  granularity: 'contrato' as const,
  glossaryOverrides: [],
  complianceConstraints: ['CVM 60'],
};

const mockPersona = {
  id: 'cfo-securitizadora',
  name: 'CFO de Securitizadora',
  layer: 'estrategica' as const,
  language: 'executiva' as const,
  horizon: 'longo' as const,
  priorityKpis: ['oc', 'es', 'wal', 'ltv', 'pdd'],
  preferredGranularity: 'carteira' as const,
  preferredVisuals: ['kpi', 'line'],
  jargonAnchor: ['overcollateralization', 'subordinação'],
  forbidden: ['jargão técnico contábil'],
};

const mockIcp = {
  id: 'fundo-cri-listado',
  segment: 'FII de CRI listado',
  examples: ['KNCR11', 'CPTS11'],
  primaryKpis: ['dy', 'duration'],
  decisionJourney: 'rebalance mensal',
};

const mockMacro: MacroSnapshot = {
  asOfDate: '2026-05-04',
  source: 'BCB_SGS',
  series: {
    selic: { last: 14.75, series: [] },
    ipca12m: { last: 4.5, series: [] },
    incc12m: { last: 6.8, series: [] },
    igpm12m: { last: 5.2, series: [] },
    tr12m: { last: 0.5, series: [] },
  },
};

const ctxFull: BusinessContext = { client: mockClient, persona: mockPersona, icp: mockIcp };
const ctxNoIcp: BusinessContext = { client: mockClient, persona: mockPersona, icp: null };

describe('buildAgentSystem', () => {
  it('returns string with header containing clientId, personaId, icpId, glossaryVersion', () => {
    const out = buildAgentSystem({ clientId: 'vila-rosa', context: ctxFull, macro: mockMacro, baseInstructions: 'BASE' });
    expect(out).toMatch(/client=vila-rosa/);
    expect(out).toMatch(/persona=cfo-securitizadora/);
    expect(out).toMatch(/icp=fundo-cri-listado/);
    expect(out).toMatch(/glossary=\d{4}-\d{2}-\d{2}/);
  });

  it('contains client portfolio block', () => {
    const out = buildAgentSystem({ clientId: 'vila-rosa', context: ctxFull, macro: mockMacro, baseInstructions: 'BASE' });
    expect(out).toContain('CRI MCMV');
    expect(out).toContain('CVM 60');
  });

  it('contains persona language and forbidden block', () => {
    const out = buildAgentSystem({ clientId: 'vila-rosa', context: ctxFull, macro: mockMacro, baseInstructions: 'BASE' });
    expect(out).toContain('executiva');
    expect(out).toContain('jargão técnico contábil');
  });

  it('contains icp block when icp present', () => {
    const out = buildAgentSystem({ clientId: 'vila-rosa', context: ctxFull, macro: mockMacro, baseInstructions: 'BASE' });
    expect(out).toContain('FII de CRI listado');
    expect(out).toContain('rebalance mensal');
  });

  it('omits full icp block when icp null', () => {
    const out = buildAgentSystem({ clientId: 'vila-rosa', context: ctxNoIcp, macro: mockMacro, baseInstructions: 'BASE' });
    expect(out).not.toContain('FII de CRI listado');
    expect(out).toMatch(/icp=none/);
  });

  it('appends macro snapshot section', () => {
    const out = buildAgentSystem({ clientId: 'vila-rosa', context: ctxFull, macro: mockMacro, baseInstructions: 'BASE' });
    expect(out).toContain('Selic');
    expect(out).toContain('14.75');
    expect(out).toContain('BCB_SGS');
  });

  it('includes glossary terms relevant to persona priorityKpis', () => {
    const out = buildAgentSystem({ clientId: 'vila-rosa', context: ctxFull, macro: mockMacro, baseInstructions: 'BASE' });
    expect(out.toLowerCase()).toContain('ltv');
    expect(out.toLowerCase()).toContain('pdd');
  });

  it('appends baseInstructions at the end', () => {
    const out = buildAgentSystem({ clientId: 'vila-rosa', context: ctxFull, macro: mockMacro, baseInstructions: 'CUSTOM_BASE_TAG_42' });
    expect(out.endsWith('CUSTOM_BASE_TAG_42')).toBe(true);
  });

  it('drops icp details when estimated tokens > 8000', () => {
    const huge = 'X'.repeat(40_000);
    const out = buildAgentSystem({ clientId: 'vila-rosa', context: ctxFull, macro: mockMacro, baseInstructions: huge });
    expect(out).not.toContain('KNCR11');
    expect(out).toContain('FII de CRI listado');
  });

  describe('with retrievedContext (Sprint 2.D)', () => {
    const baseRetrieved: RetrievedBusinessContext = {
      static: {},
      retrieved: Array.from({ length: 5 }, (_, i) => ({
        id: `c${i}`,
        score: 0.9 - i * 0.1,
        text: `chunk content ${i}`,
        metadata: { clientId: 'vila-rosa' as const, sourceDoc: `docs/x${i}.md`, themes: [] },
      })),
      macro: {},
      template: {
        id: 'diretor-fii-cri-om',
        persona: 'diretor-fii-cri',
        client: 'vila-rosa',
        kpis: [
          { key: 'oc', label: 'OC', priority: 'critical' },
          { key: 'es', label: 'ES', priority: 'critical' },
          { key: 'wal', label: 'WAL', priority: 'high' },
        ],
        visuals: [{ type: 'kpi', title: 'KPIs', kpis: ['oc'] }],
        tables: [],
      },
      glossaryVersion: '2026-05-04',
      retrievalMeta: { latencyMs: 100, cacheHit: false, source: 'rag' },
    };

    it('renders ## Contexto recuperado section when retrievedContext provided', () => {
      const out = buildAgentSystem({
        clientId: 'vila-rosa',
        context: ctxFull,
        macro: mockMacro,
        baseInstructions: 'BASE',
        retrievedContext: baseRetrieved,
      });
      expect(out).toContain('## Contexto recuperado');
      expect(out).toContain('chunk content 0');
      expect(out).toContain('[source: docs/x0.md]');
    });

    it('renders top-3 chunks only (drops 4th and 5th)', () => {
      const out = buildAgentSystem({
        clientId: 'vila-rosa',
        context: ctxFull,
        macro: mockMacro,
        baseInstructions: 'BASE',
        retrievedContext: baseRetrieved,
      });
      expect(out).toContain('chunk content 0');
      expect(out).toContain('chunk content 2');
      expect(out).not.toContain('chunk content 3');
      expect(out).not.toContain('chunk content 4');
    });

    it('falls back to static-only when retrievedContext undefined', () => {
      const out = buildAgentSystem({
        clientId: 'vila-rosa',
        context: ctxFull,
        macro: mockMacro,
        baseInstructions: 'BASE',
      });
      expect(out).not.toContain('## Contexto recuperado');
      expect(out).not.toContain('## Template do dashboard');
    });

    it('renders template KPIs and visuals when template present', () => {
      const out = buildAgentSystem({
        clientId: 'vila-rosa',
        context: ctxFull,
        macro: mockMacro,
        baseInstructions: 'BASE',
        retrievedContext: baseRetrieved,
      });
      expect(out).toContain('## Template do dashboard');
      expect(out).toContain('diretor-fii-cri-om');
      expect(out).toContain('OC');
      expect(out).toContain('### Visuais sugeridos');
    });

    it('drops retrieved chunks first under token pressure (>10k) but keeps template', () => {
      const huge = 'X'.repeat(50_000);
      const out = buildAgentSystem({
        clientId: 'vila-rosa',
        context: ctxFull,
        macro: mockMacro,
        baseInstructions: huge,
        retrievedContext: baseRetrieved,
      });
      expect(out).not.toContain('## Contexto recuperado');
      expect(out).toContain('## Template do dashboard');
    });
  });

  it('keeps stable blocks first for prompt cache (client → persona → icp → macro → glossary → base)', () => {
    const out = buildAgentSystem({ clientId: 'vila-rosa', context: ctxFull, macro: mockMacro, baseInstructions: 'BASE' });
    const idxClient = out.indexOf('CRI MCMV');
    const idxPersona = out.indexOf('overcollateralization');
    const idxMacro = out.indexOf('BCB_SGS');
    const idxBase = out.indexOf('BASE');
    expect(idxClient).toBeLessThan(idxPersona);
    expect(idxPersona).toBeLessThan(idxMacro);
    expect(idxMacro).toBeLessThan(idxBase);
  });
});
