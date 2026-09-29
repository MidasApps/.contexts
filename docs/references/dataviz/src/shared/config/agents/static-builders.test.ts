// src/shared/config/agents/static-builders.test.ts
import { describe, it, expect } from 'vitest';
import {
  buildDescriptiveStatic, buildDiagnosticStatic, buildPredictiveStatic, buildPrescriptiveStatic,
  buildMonitoringStatic, buildSimulationStatic, buildExternalStatic, buildCashflowStatic, buildOrchestratorStatic,
} from './index';
import {
  buildDescriptiveAgentPrompt, buildDiagnosticAgentPrompt, buildPredictiveAgentPrompt, buildPrescriptiveAgentPrompt,
  buildMonitoringAgentPrompt, buildSimulationAgentPrompt, buildExternalAgentPrompt, buildCashflowAgentPrompt,
} from './index';

const ctx = {
  dataset: 'om', filters: { viewMode: 'snapshot', dateRange: { start: '2026-01-01', end: '2026-01-31' }, projetos: [], advancedFilters: {} },
  dashboardState: '', page: '/dashboard', sessionId: 's',
} as never;

describe('buildXStatic — sem contexto dinâmico', () => {
  it('static não contém dataset nem período (não interpola ctx)', () => {
    for (const fn of [buildDescriptiveStatic, buildDiagnosticStatic, buildPredictiveStatic, buildPrescriptiveStatic, buildMonitoringStatic, buildSimulationStatic, buildExternalStatic, buildCashflowStatic]) {
      const s = fn();
      expect(s).not.toContain('## Contexto dinâmico'); // não interpola filtros/ctx
      expect(s.length).toBeGreaterThan(200); // não é one-liner
    }
  });

  it('preserva os blocos de domínio nos donos certos', () => {
    expect(buildMonitoringStatic()).toContain('CVM 60');
    expect(buildMonitoringStatic()).toContain('Covenants');
    expect(buildPredictiveStatic()).toContain('Migração de rating');
    expect(buildSimulationStatic()).toContain('Conservador');
    expect(buildExternalStatic()).toContain('432'); // Selic SGS
    expect(buildPrescriptiveStatic()).toContain('Repasse bancário');
    expect(buildCashflowStatic()).toContain('WAL');
    expect(buildDiagnosticStatic()).toContain('HHI');
  });

  it('orchestrator static tem a árvore de roteamento mas não a página dinâmica', () => {
    const s = buildOrchestratorStatic();
    expect(s).toContain('Árvore de roteamento');
    expect(s).toContain('descriptive_agent');
    expect(s).not.toContain('Contexto da sessão'); // dinâmico saiu
  });
});

describe('buildXAgentPrompt — recomposto, mantém conteúdo (regressão)', () => {
  it('descriptive ainda contém persona + SQL rules + glossário + response', () => {
    const p = buildDescriptiveAgentPrompt(ctx);
    expect(p).toContain('agente descritivo'); // persona
    expect(p).toContain('APENAS SELECT'); // SQL_RULES
    // O schema de tabela saiu do prompt: ele vem do data contract do cliente,
    // ou não vem. Ver `portfolio-schema-text.ts`.
    expect(p).not.toContain('Tabela contratos');
    expect(p).toContain('Glossário de termos'); // business
    expect(p).toContain('português do Brasil'); // RESPONSE_GUIDELINES
    expect(p).toContain('om'); // dynamic filter (dataset)
  });

  it('cada buildXAgentPrompt contém SQL_RULES, glossário e response — e nenhum schema fixo', () => {
    for (const fn of [buildDiagnosticAgentPrompt, buildPredictiveAgentPrompt, buildPrescriptiveAgentPrompt, buildMonitoringAgentPrompt, buildSimulationAgentPrompt, buildExternalAgentPrompt, buildCashflowAgentPrompt]) {
      const p = fn(ctx);
      expect(p).toContain('APENAS SELECT');
      expect(p).toContain('Glossário de termos');
      expect(p).toContain('português do Brasil');
      expect(p).not.toContain('Tabela contratos');
    }
  });
});
