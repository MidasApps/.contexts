import { describe, it, expect } from 'vitest';
import { buildAgentDynamicContext, buildOrchestratorDynamicContext } from './dynamic-context';
import type { AgentDynamicContext } from './types';

const baseCtx = {
  dataset: 'om_dataset',
  filters: { viewMode: 'snapshot', dateRange: { start: '2026-01-01', end: '2026-01-31' }, projetos: [], advancedFilters: {} },
  dashboardState: '',
  page: '/dashboard',
  sessionId: 's',
} as unknown as AgentDynamicContext;

describe('buildAgentDynamicContext', () => {
  it('inclui o contexto de filtros (dataset/período)', () => {
    const out = buildAgentDynamicContext(baseCtx);
    expect(out).toContain('om_dataset');
    expect(out).toContain('2026-01-31');
  });

  it('inclui o estado do dashboard quando há indicadores', () => {
    const out = buildAgentDynamicContext({ ...baseCtx, dashboardState: 'Inadimplência: 4,2%' });
    expect(out).toContain('Estado atual do dashboard');
    expect(out).toContain('Inadimplência: 4,2%');
  });

  it('omite o dashboard quando vazio ou "Nenhum indicador carregado"', () => {
    expect(buildAgentDynamicContext(baseCtx)).not.toContain('Estado atual do dashboard');
    expect(buildAgentDynamicContext({ ...baseCtx, dashboardState: 'Nenhum indicador carregado' }))
      .not.toContain('Estado atual do dashboard');
  });
});

describe('buildOrchestratorDynamicContext', () => {
  it('inclui a página da sessão', () => {
    expect(buildOrchestratorDynamicContext(baseCtx)).toContain('Início');
  });

  it('prioriza o indicador em foco quando presente', () => {
    const out = buildOrchestratorDynamicContext({ ...baseCtx, focusedIndicator: { name: 'PDD', value: 'R$ 1M' } });
    expect(out).toContain('Indicador em foco');
    expect(out).toContain('PDD');
  });
});
