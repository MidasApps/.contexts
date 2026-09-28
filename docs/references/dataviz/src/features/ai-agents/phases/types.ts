/**
 * Sprint 3.B — Phase-based tool gating types.
 *
 * Implementa ADR-0008 (`adrs/decisions/0008-phase-based-tool-gating-prepare-step.md`).
 * O orchestrator infere uma fase analítica a cada step e usa ela para filtrar
 * os sub-agentes disponíveis via `prepareStep` + `activeTools` do AI SDK v6.
 */

export type OrchestratorPhase = 'discovery' | 'diagnosis' | 'prescription' | 'monitoring';

// PhaseContext saiu com infer-phase/phase-to-tools: era o retorno do gating de
// fase do runtime AI SDK v6. O que sobra aqui — OrchestratorPhase e
// SubAgentName — segue vivo em agents/types.ts e na rota de métricas do
// orchestrator.

export type SubAgentName =
  | 'descriptive_agent'
  | 'diagnostic_agent'
  | 'predictive_agent'
  | 'simulation_agent'
  | 'prescriptive_agent'
  | 'monitoring_agent'
  | 'cashflow_agent'
  | 'external_agent';
