/**
 * Tipos canônicos do harness de evals (Sprint 3.D).
 *
 * Alinhado a ADR-0010 (eval harness próprio sobre AI SDK v6). O método
 * canônico é `run`; `evaluate` é mantido como alias deprecado para
 * suavizar transição de call-sites.
 *
 * Multi-tenancy (ADR-0006): `clientId` e `personaId` são propagados em
 * todo `ScorerInput.context` e carimbados em `ScoreResult.metadata` pelo
 * `createScorer`.
 */

import type { ClientId } from '@/shared/config/agents/types';

/**
 * `PersonaId` ainda não é uma união estrita no projeto — `PersonaProfile.id`
 * é validado por regex (`^[a-z0-9-]+$`). Mantemos `string` aqui e o
 * `PersonaProfile` continua a fonte canônica de IDs válidos. Quando uma
 * união estrita for derivada (Sprint 4 hipotético), substituir por
 * `keyof typeof PERSONAS` ou import equivalente.
 */
export type PersonaId = string;

/** Saída do agente que será avaliada por um scorer. */
export type AgentOutput = {
  /** SQL gerado (scorer `sql_correctness`). */
  sql?: string;
  /** Layout JSON (scorer `layout_coherence`). */
  layout?: unknown;
  /** Texto narrativo (scorers de judge). */
  narrative?: string;
  /** Lista de chamadas de tools (scorer `tool_call_accuracy`). */
  toolCalls?: Array<{ toolName: string; args: unknown }>;
  /** Campos extras a depender do agente (livre). */
  [key: string]: unknown;
};

/** Resultado padronizado retornado por todo Scorer. */
export type ScoreResult = {
  /** 0..1, onde 1.0 é perfeito. */
  score: number;
  /** Justificativa textual (judge ou função explicativa). */
  rationale?: string;
  /** Metadados auto-carimbados pelo `createScorer` + extras do scorer. */
  metadata?: Record<string, unknown>;
  /** Para function-based binários (opcional). */
  passed?: boolean;
};

/** Input padronizado consumido por todo Scorer. */
export type ScorerInput = {
  briefing: BriefingFixture;
  agentOutput: AgentOutput;
  context: {
    clientId: ClientId;
    personaId: PersonaId;
    /** Data-base do macro snapshot ("YYYY-MM-DD"). */
    macroAsOf: string;
  };
};

/** Lista canônica de scorers — usada como chave em registries e BQ. */
export type ScorerName =
  | 'sql_correctness'
  | 'layout_coherence'
  | 'persona_fit'
  | 'business_correctness'
  | 'citation_grounding'
  | 'faithfulness'
  | 'prompt_alignment'
  | 'tool_call_accuracy';

/** Interface canônica de Scorer (ADR-0010). */
export type Scorer = {
  name: string;
  kind: 'function' | 'judge' | 'hybrid';
  /** Apenas para `kind ∈ {judge, hybrid}`. */
  judgeModelVersion?: string;
  run: (input: ScorerInput) => Promise<ScoreResult>;
  /** @deprecated use `run` */
  evaluate?: (input: ScorerInput) => Promise<ScoreResult>;
};

/** Fixture de briefing usada em datasets de eval. */
export type BriefingFixture = {
  id: string;
  templateId: 1 | 2 | 3 | 4 | 5 | 6;
  personaId: PersonaId;
  clientId: ClientId;
  briefing: string;
  expectedKpis: string[];
  expectedVisuals: string[];
  expectedTopics: string[];
  expectedRegulatory?: Array<'CMN_2682' | 'CVM_60' | 'Lei_13786' | 'CMN_4676' | 'IFRS_9'>;
  /** Apenas em `gold-30`. */
  goldScores?: Partial<Record<ScorerName, number>>;
};

/** Resultado agregado de uma execução do runner. */
export type EvalRun = {
  runId: string;
  startedAt: string;
  finishedAt: string;
  suite: 'smoke' | 'full' | 'gold';
  judgeModelVersion: string;
  glossaryVersion: string;
  regulatoryPackVersion: string;
  results: Array<{
    fixtureId: string;
    scorerName: string;
    score: number;
    rationale?: string;
    durationMs: number;
    tokensIn?: number;
    tokensOut?: number;
    costUsd?: number;
    clientId: ClientId;
    personaId: PersonaId;
  }>;
  totals: {
    p50: Record<string, number>;
    p95: Record<string, number>;
    costUsd: number;
  };
};
