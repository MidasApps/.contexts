import { describe, it, expect } from 'vitest';
import { buildDescriptiveAgentPrompt } from './descriptive-agent';
import {
  buildDiagnosticAgentPrompt,
  buildPredictiveAgentPrompt,
  buildSimulationAgentPrompt,
  buildPrescriptiveAgentPrompt,
  buildMonitoringAgentPrompt,
  buildCashflowAgentPrompt,
  buildExternalAgentPrompt,
} from '@/shared/config/agents';
import { renderSemanticContextSections } from './shared-context';
import type { AgentDynamicContext, ChatRequestFilters } from './types';
import type { ClientSemanticContext } from '@/shared/repositories/client-semantic-context';

const baseFilters: ChatRequestFilters = {
  dateRange: { start: '2026-01-01', end: '2026-01-31' },
  compareEnabled: false,
  viewMode: 'snapshot',
};

const baseDescriptiveCtx: AgentDynamicContext = {
  dataset: 'om_dataset',
  filters: baseFilters,
  dashboardState: 'Nenhum indicador carregado',
  page: 'dashboard',
  sessionId: 'sess-1',
};
const semanticContextFull: ClientSemanticContext = {
  clientId: 'OM',
  metrics: [
    {
      id: 'dashboard.evolucao_saldo_devedor',
      name: 'Evolução do Saldo Devedor',
      description: 'Saldo devedor agregado por mês.',
      recipe: { kind: 'aggregation', op: 'sum' },
      requires: ['canonical.contratos.saldo_devedor'],
      productId: 'prod-dashboard',
    },
    {
      id: 'dashboard.ltv_medio',
      name: 'LTV Médio',
      // no recipe → label-only
      requires: ['canonical.contratos.ltv'],
      productId: 'prod-dashboard',
    },
  ],
  dataContracts: [
    {
      contractId: 'canonical',
      entities: [
        {
          entityId: 'contratos',
          attributes: [
            { attributeId: 'saldo_devedor', type: 'FLOAT64', description: 'Saldo devedor atualizado', column: 'saldo_devedor' },
            { attributeId: 'ltv', type: 'FLOAT64', column: 'ltv' },
          ],
        },
      ],
    },
  ],
};

describe('renderSemanticContextSections', () => {
  it('renders both sections with reuse + create instructions, executable marker, and no SQL dump', () => {
    const out = renderSemanticContextSections(semanticContextFull);

    // Both section headers present
    expect(out).toContain('## Métricas já disponíveis para este cliente');
    expect(out).toContain('## Data contract do cliente (colunas físicas reais)');

    // Lead-in instructions
    expect(out).toContain('Reutilize estas métricas quando a pergunta corresponder a uma delas; não recrie equivalentes.');
    expect(out).toContain('Escreva SQL usando EXATAMENTE estas colunas físicas.');

    // Metric lines: id — name
    expect(out).toContain('dashboard.evolucao_saldo_devedor — Evolução do Saldo Devedor');
    expect(out).toContain('dashboard.ltv_medio — LTV Médio');

    // Description note when present
    expect(out).toContain('Saldo devedor agregado por mês.');

    // Executable marker only on the metric with a recipe
    const evoLine = out.split('\n').find((l) => l.includes('dashboard.evolucao_saldo_devedor'))!;
    const ltvLine = out.split('\n').find((l) => l.includes('dashboard.ltv_medio'))!;
    expect(evoLine).toContain('executável');
    expect(ltvLine).not.toContain('executável');

    // Data contract entity + physical column per attribute
    expect(out).toContain('Entidade `contratos`:');
    expect(out).toContain('saldo_devedor → coluna `saldo_devedor`');
    expect(out).toContain('ltv → coluna `ltv`');

    // No raw recipe object / giant SQL dumped
    expect(out).not.toContain('"op"');
    expect(out).not.toContain('SELECT');
  });

  it('returns empty string when semanticContext is null/undefined', () => {
    expect(renderSemanticContextSections(undefined)).toBe('');
    expect(renderSemanticContextSections(null)).toBe('');
  });

  it('renders only the data-contract section when metrics empty', () => {
    const out = renderSemanticContextSections({
      ...semanticContextFull,
      metrics: [],
    });
    expect(out).not.toContain('## Métricas já disponíveis para este cliente');
    expect(out).toContain('## Data contract do cliente (colunas físicas reais)');
  });

  it('renderiza a coluna física e omite atributos sem column (G5)', () => {
    const sc = {
      clientId: 'BRZ',
      metrics: [],
      dataContracts: [
        {
          contractId: 'liquid-play',
          entities: [
            {
              entityId: 'contratos',
              attributes: [
                { attributeId: 'saldo_devedor', type: 'float', column: 'vl_saldo_dev' },
                { attributeId: 'sem_bind', type: 'int', column: null },
              ],
            },
          ],
        },
      ],
    } as unknown as ClientSemanticContext;
    const out = renderSemanticContextSections(sc);
    expect(out).toContain('vl_saldo_dev');
    expect(out).toContain('saldo_devedor');
    expect(out).not.toContain('sem_bind'); // omitido (sem column)
  });

  it('renders only the metrics section when dataContracts empty', () => {
    const out = renderSemanticContextSections({
      ...semanticContextFull,
      dataContracts: [],
    });
    expect(out).toContain('## Métricas já disponíveis para este cliente');
    expect(out).not.toContain('## Data contract disponível');
  });

  it('returns empty string when both metrics and dataContracts empty', () => {
    const out = renderSemanticContextSections({
      clientId: 'OM',
      metrics: [],
      dataContracts: [],
    });
    expect(out).toBe('');
  });
});


describe('buildDescriptiveAgentPrompt — semantic context injection', () => {
  it('renders both sections when semanticContext present', () => {
    const out = buildDescriptiveAgentPrompt({ ...baseDescriptiveCtx, semanticContext: semanticContextFull });
    expect(out).toContain('## Métricas já disponíveis para este cliente');
    expect(out).toContain('## Data contract do cliente (colunas físicas reais)');
    expect(out).toContain('dashboard.evolucao_saldo_devedor — Evolução do Saldo Devedor');
    expect(out).toContain('Reutilize estas métricas');
    expect(out).toContain('Escreva SQL usando EXATAMENTE estas colunas físicas.');
    // executable marker present, no SQL dumped
    expect(out).toContain('executável');
    expect(out).not.toContain('"kind"');
  });

  it('omits both sections when semanticContext undefined (baseline unchanged)', () => {
    const withCtx = buildDescriptiveAgentPrompt({ ...baseDescriptiveCtx, semanticContext: semanticContextFull });
    const baseline = buildDescriptiveAgentPrompt(baseDescriptiveCtx);
    expect(baseline).not.toContain('## Métricas já disponíveis para este cliente');
    expect(baseline).not.toContain('## Data contract disponível');
    expect(withCtx).not.toBe(baseline);
  });

  it('renders only the metrics section when contracts empty', () => {
    const out = buildDescriptiveAgentPrompt({
      ...baseDescriptiveCtx,
      semanticContext: { ...semanticContextFull, dataContracts: [] },
    });
    expect(out).toContain('## Métricas já disponíveis para este cliente');
    expect(out).not.toContain('## Data contract disponível');
  });
});

describe('build*AgentPrompt — schema real do cliente (G5-sub-agentes)', () => {
  const SUB_AGENT_BUILDERS: Record<string, (ctx: AgentDynamicContext) => string> = {
    descriptive: buildDescriptiveAgentPrompt,
    diagnostic: buildDiagnosticAgentPrompt,
    predictive: buildPredictiveAgentPrompt,
    simulation: buildSimulationAgentPrompt,
    prescriptive: buildPrescriptiveAgentPrompt,
    monitoring: buildMonitoringAgentPrompt,
    cashflow: buildCashflowAgentPrompt,
    external: buildExternalAgentPrompt,
  };

  for (const [name, build] of Object.entries(SUB_AGENT_BUILDERS)) {
    it(`${name}: omite o hardcoded e usa as colunas reais quando o cliente tem schema`, () => {
      const out = build({ ...baseDescriptiveCtx, semanticContext: semanticContextFull });
      expect(out).not.toContain('## Schema: Tabela contratos');
      expect(out).toContain('saldo_devedor → coluna `saldo_devedor`');
    });
    // Mesma inversão do caso do canvas: nenhum agente pode receber o schema de
    // um cliente quando o cliente da requisição não tem o seu.
    it(`${name}: cliente SEM schema não recebe o de outro cliente`, () => {
      const out = build(baseDescriptiveCtx);
      expect(out).not.toContain('## Schema: Tabela contratos');
    });
  }
});
