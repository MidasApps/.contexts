# AI Studio Fase 5 — Config Canônica Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar a config do AI Studio a fonte de verdade editável dos prompts (instruções completas + 4 skills compartilhadas), com o contexto dinâmico sempre injetado em runtime, e descontinuar as flags `AI_STUDIO_*` + fallback duplo.

**Architecture:** Cada `build*AgentPrompt(ctx)` é separado em `buildXStatic()` (texto estático → seedado em `Agent.instructions` e usado como fallback em código) e contexto dinâmico (`buildAgentDynamicContext(ctx)`, sempre anexado). Conhecimento compartilhado (RESPONSE_GUIDELINES, SQL_RULES, schema, business) vira 4 skills de sistema (playbooks). Runtime sempre lê config; se falhar, cai no baseline de código. Sem flags.

**Tech Stack:** Next.js 16, TypeScript, Zod 4, Vitest 4 (`vitest run`, happy-dom, alias `@`→`src`/`@app`→`app`), `@mastra/core` Agent, `@ai-sdk/google-vertex`, Firestore (firebase-admin), pnpm 10.32.1.

## Global Constraints

- **Spec canônico:** `docs/superpowers/specs/2026-06-18-ai-studio-config-canonica-design.md` — em divergência, a ADR/spec vence.
- **Sem flags:** zero referências a `AI_STUDIO_AGENTS`/`AI_STUDIO_KB`/`AI_STUDIO_SKILLS`/`AI_STUDIO_WORKFLOWS` (env) e `useAiStudio*`/setters (app-store) ao final.
- **Fail-soft, nunca cego:** runtime lê config; em falha/ausência → baseline de código (estático completo + dinâmico). Nunca string vazia, nunca crash do chat.
- **4 skills de sistema:** `response-style` (RESPONSE_GUIDELINES), `sql-foundations` (SQL_RULES), `portfolio-schema` (buildSchemaContext()), `credit-domain` (buildBusinessContext()). `toolRefs: []`. Referenciadas pelos 8 sub-agentes.
- **Tools code-wired nesta fase:** set real vem do `buildToolsFactory` (`buildXAgentTools`); `toolRefs`/`skillRefs.toolRefs` ficam vazias (camada aditiva = no-op). NÃO expandir manifesto.
- **Model = ModelTier da config:** `router`/`fast`/`reasoning`. Tiers reais: `reasoning` para diagnostic/predictive/prescriptive/monitoring/simulation; `fast` para descriptive/external/cashflow; `router` para orchestrator. Resolvido via `getModel(tier)` de `@/features/ai-agents/model-registry`.
- **Idempotência do seed:** `ensureSeed` permanece create-if-absent; reseed com `--force` sobrescreve só `origin:'system'`, nunca `origin:'user'`.
- **Reordenação aceita:** o prompt final muda de ordem (identidade → conhecimento compartilhado → dados vivos). Fidelidade = mesmo CONTEÚDO, não mesma ordem. Testes de regressão checam PRESENÇA das seções, não match exato.
- **Verificação:** cada task roda seus testes; tasks de wiring rodam também `pnpm build` (type-check Next, pega erros que o vitest mascara com `server-only` stub). Commits frequentes.
- **Idioma:** mensagens de commit e código seguem o padrão do repo (pt-BR nos textos de domínio). Commits terminam com `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Contexto dinâmico compartilhado (`dynamic-context.ts`)

**Files:**
- Create: `src/shared/config/agents/dynamic-context.ts`
- Test: `src/shared/config/agents/dynamic-context.test.ts`

**Interfaces:**
- Consumes: `buildDynamicFilterContext(ctx)`, `renderSemanticContextSections(sc)` de `./shared-context`; `AgentDynamicContext` de `./types`.
- Produces: `buildAgentDynamicContext(ctx: AgentDynamicContext): string` e `buildOrchestratorDynamicContext(ctx: AgentDynamicContext): string`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/shared/config/agents/dynamic-context.test.ts
import { describe, it, expect } from 'vitest';
import { buildAgentDynamicContext, buildOrchestratorDynamicContext } from './dynamic-context';

const baseCtx = {
  dataset: 'om_dataset',
  filters: { viewMode: 'snapshot', dateRange: { start: '2026-01-01', end: '2026-01-31' }, projetos: [], advancedFilters: {} },
  dashboardState: '',
  page: '/dashboard',
  sessionId: 's',
} as never;

describe('buildAgentDynamicContext', () => {
  it('inclui o contexto de filtros (dataset/período)', () => {
    const out = buildAgentDynamicContext(baseCtx);
    expect(out).toContain('om_dataset');
    expect(out).toContain('2026-01-31');
  });

  it('inclui o estado do dashboard quando há indicadores', () => {
    const out = buildAgentDynamicContext({ ...baseCtx, dashboardState: 'Inadimplência: 4,2%' } as never);
    expect(out).toContain('Estado atual do dashboard');
    expect(out).toContain('Inadimplência: 4,2%');
  });

  it('omite o dashboard quando vazio ou "Nenhum indicador carregado"', () => {
    expect(buildAgentDynamicContext(baseCtx)).not.toContain('Estado atual do dashboard');
    expect(buildAgentDynamicContext({ ...baseCtx, dashboardState: 'Nenhum indicador carregado' } as never))
      .not.toContain('Estado atual do dashboard');
  });
});

describe('buildOrchestratorDynamicContext', () => {
  it('inclui a página da sessão', () => {
    expect(buildOrchestratorDynamicContext(baseCtx)).toContain('Visão Geral');
  });

  it('prioriza o indicador em foco quando presente', () => {
    const out = buildOrchestratorDynamicContext({ ...baseCtx, focusedIndicator: { name: 'PDD', value: 'R$ 1M' } } as never);
    expect(out).toContain('Indicador em foco');
    expect(out).toContain('PDD');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/shared/config/agents/dynamic-context.test.ts`
Expected: FAIL — "Failed to resolve import ./dynamic-context" / function not defined.

- [ ] **Step 3: Write the implementation**

Crie `src/shared/config/agents/dynamic-context.ts`. O `buildAgentDynamicContext` agrega filtros + semantic + dashboard (extraído do `descriptive-agent.ts` atual). O `buildOrchestratorDynamicContext` extrai as seções dinâmicas do `orchestrator.ts` atual (página, focused, indicators).

```typescript
import type { AgentDynamicContext } from './types';
import { buildDynamicFilterContext, renderSemanticContextSections } from './shared-context';

const PAGE_LABELS: Record<string, string> = {
  '/dashboard': 'Visão Geral',
  '/contratos': 'Contratos',
  '/pdd': 'PDD (Provisão)',
  '/elegibilidade': 'Elegibilidade',
  '/fluxo-de-caixa': 'Fluxo de Caixa',
  '/pagamentos': 'Pagamentos',
  '/repasse': 'Repasse',
  '/simulacao': 'Simulação',
  '/detalhamento': 'Detalhamento',
  '/pricing': 'Pricing',
};

function hasIndicators(dashboardState?: string): boolean {
  return !!dashboardState && dashboardState.trim().length > 0 && !dashboardState.includes('Nenhum indicador carregado');
}

/** Contexto dinâmico por request, anexado por baixo da instrução (config). Sub-agentes. */
export function buildAgentDynamicContext(ctx: AgentDynamicContext): string {
  const parts: string[] = [buildDynamicFilterContext(ctx)];
  const semantic = renderSemanticContextSections(ctx.semanticContext);
  if (semantic) parts.push(semantic);
  if (hasIndicators(ctx.dashboardState)) {
    parts.push(
      `## Estado atual do dashboard\n\n${ctx.dashboardState}\n\n> Os indicadores acima já estão visíveis na tela do usuário. Responda DIRETAMENTE usando esses dados quando suficientes. Só consulte o BigQuery se precisar de dados que NÃO estão nos indicadores acima.`,
    );
  }
  return parts.join('\n\n');
}

/** Contexto dinâmico do supervisor (página/foco/indicadores). Extraído do orchestrator.ts. */
export function buildOrchestratorDynamicContext(ctx: AgentDynamicContext): string {
  const parts: string[] = [];
  const pageLabel = PAGE_LABELS[ctx.page] ?? ctx.page;
  parts.push(`## Contexto da sessão\n\nO usuário está na página **"${pageLabel}"** (${ctx.page}).`);
  if (!ctx.focusedIndicator) {
    parts.push(`> Quando o usuário fizer perguntas genéricas como "qual a tendência?", "por que subiu?", assuma que se refere aos indicadores visíveis nesta página.`);
  }
  if (ctx.focusedIndicator) {
    parts.push(
      `## Indicador em foco (PRIORIDADE)\n\nO usuário está visualizando o indicador **"${ctx.focusedIndicator.name}"**${ctx.focusedIndicator.value ? ` (valor atual: ${ctx.focusedIndicator.value})` : ''}.\n${ctx.focusedIndicator.history ? `Histórico: ${ctx.focusedIndicator.history}` : ''}\n\n> **Regra:** Quando o usuário fizer perguntas genéricas ("projete os próximos 6 meses", "por que caiu?"), assuma que está se referindo a este indicador. Passe o nome do indicador explicitamente na query do agente. Nunca pergunte qual indicador — use este.`,
    );
  }
  if (hasIndicators(ctx.dashboardState)) {
    parts.push(`## Indicadores disponíveis no dashboard (já carregados)\n\n${ctx.dashboardState}\n\n> Use o **descriptive_agent** para perguntas que esses dados respondem. Só use agentes analíticos se o usuário precisar de dados que NÃO estão acima.`);
  } else {
    parts.push(`## Indicadores disponíveis no dashboard\n\n> Nenhum indicador carregado ainda. Use o **descriptive_agent** para consultar dados.`);
  }
  return parts.join('\n\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/shared/config/agents/dynamic-context.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/config/agents/dynamic-context.ts src/shared/config/agents/dynamic-context.test.ts
git commit -m "feat(ai-studio): contexto dinâmico compartilhado (buildAgentDynamicContext/buildOrchestratorDynamicContext)"
```

---

### Task 2: Extrair `buildXStatic()` dos 8 builders + orchestrator

**Files:**
- Modify: `src/shared/config/agents/{descriptive,diagnostic,predictive,prescriptive,monitoring,simulation,external,cashflow}-agent.ts`
- Modify: `src/shared/config/agents/orchestrator.ts`
- Modify: `src/shared/config/agents/index.ts` (re-export dos novos `buildXStatic`/`buildOrchestratorStatic` — confirmar o barrel; se as builders já são re-exportadas lá, adicionar os novos nomes)
- Test: `src/shared/config/agents/static-builders.test.ts`

**Interfaces:**
- Produces: `buildDescriptiveStatic(): string`, `buildDiagnosticStatic()`, `buildPredictiveStatic()`, `buildPrescriptiveStatic()`, `buildMonitoringStatic()`, `buildSimulationStatic()`, `buildExternalStatic()`, `buildCashflowStatic()`, `buildOrchestratorStatic(): string`. Todas sem parâmetro `ctx`.
- Mantém: `buildXAgentPrompt(ctx)` e `buildOrchestratorPrompt(ctx)` funcionais (recompostos), para os callers legados.

**Recipe (mecânico, aplicar a cada builder):** `buildXStatic()` retorna TODO o texto estático do builder — persona, capacidades, guia de tools, regras, benchmarks, tom/estilo, **e os blocos de domínio específicos do agente** (covenants/CVM no monitoring; early-warning no predictive; cenários no simulation; BCB+correlações no external; scoring de ações no prescriptive; métricas WAL/spread no cashflow; tabelas HHI/polaridade no diagnostic) — **removendo** as interpolações de helpers compartilhados (`${SQL_RULES}`, `${RESPONSE_GUIDELINES}`, `${buildSchemaContext()}`, `${buildBusinessContext()}`, `${buildDynamicFilterContext(ctx)}`, `${renderSemanticContextSections(...)}`, e a seção condicional de dashboard). Depois `buildXAgentPrompt(ctx)` é recomposto como `[buildXStatic(), SQL_RULES, buildSchemaContext(), buildBusinessContext(), buildDynamicFilterContext(ctx), <semantic se houver>, <dashboard se houver>, RESPONSE_GUIDELINES].join('\n\n')` (ordem original do arquivo; aceita-se a reordenação para os callers legados).

- [ ] **Step 1: Write the failing test**

```typescript
// src/shared/config/agents/static-builders.test.ts
import { describe, it, expect } from 'vitest';
import {
  buildDescriptiveStatic, buildDiagnosticStatic, buildPredictiveStatic, buildPrescriptiveStatic,
  buildMonitoringStatic, buildSimulationStatic, buildExternalStatic, buildCashflowStatic, buildOrchestratorStatic,
} from './index';
import {
  buildDescriptiveAgentPrompt, buildDiagnosticAgentPrompt, buildPredictiveAgentPrompt, buildPrescriptiveAgentPrompt,
  buildMonitoringAgentPrompt, buildSimulationAgentPrompt, buildExternalAgentPrompt, buildCashflowAgentPrompt,
  buildOrchestratorPrompt,
} from './index';

const ctx = {
  dataset: 'om', filters: { viewMode: 'snapshot', dateRange: { start: '2026-01-01', end: '2026-01-31' }, projetos: [], advancedFilters: {} },
  dashboardState: '', page: '/dashboard', sessionId: 's',
} as never;

describe('buildXStatic — sem contexto dinâmico', () => {
  it('static não contém dataset nem período (não interpola ctx)', () => {
    for (const fn of [buildDescriptiveStatic, buildDiagnosticStatic, buildPredictiveStatic, buildPrescriptiveStatic, buildMonitoringStatic, buildSimulationStatic, buildExternalStatic, buildCashflowStatic]) {
      const s = fn();
      expect(s).not.toContain('om'); // dataset
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
  it('descriptive ainda contém persona + SQL rules + schema + glossário + response', () => {
    const p = buildDescriptiveAgentPrompt(ctx);
    expect(p).toContain('agente descritivo'); // persona
    expect(p).toContain('APENAS SELECT'); // SQL_RULES
    expect(p).toContain('Tabela contratos'); // schema
    expect(p).toContain('Glossário de termos'); // business
    expect(p).toContain('português do Brasil'); // RESPONSE_GUIDELINES
    expect(p).toContain('om'); // dynamic filter (dataset)
  });

  it('cada buildXAgentPrompt contém SQL_RULES, schema, glossário e response', () => {
    for (const fn of [buildDiagnosticAgentPrompt, buildPredictiveAgentPrompt, buildPrescriptiveAgentPrompt, buildMonitoringAgentPrompt, buildSimulationAgentPrompt, buildExternalAgentPrompt, buildCashflowAgentPrompt]) {
      const p = fn(ctx);
      expect(p).toContain('APENAS SELECT');
      expect(p).toContain('Glossário de termos');
      expect(p).toContain('português do Brasil');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/shared/config/agents/static-builders.test.ts`
Expected: FAIL — `buildDescriptiveStatic` não exportado.

- [ ] **Step 3: Refatorar — exemplo trabalhado (descriptive)**

`descriptive-agent.ts` passa a ser (note: `buildDescriptiveStatic` agrupa persona+capacidades+guia+regra+benchmarks+tom; `buildDescriptiveAgentPrompt` recompõe):

```typescript
import type { AgentDynamicContext } from './types';
import { buildBusinessContext, buildSchemaContext, buildDynamicFilterContext, renderSemanticContextSections, SQL_RULES, RESPONSE_GUIDELINES } from './shared-context';

/** Texto estático (persona, capacidades, guia de tools, regra, benchmarks, tom). Sem ctx. → seed/fallback. */
export function buildDescriptiveStatic(): string {
  return `Você é um agente descritivo especializado em carteiras de crédito imobiliário securitizado. Sua função é responder "O que aconteceu?" e "Como está a carteira?".

## Capacidades
- Interpretar KPIs e indicadores do dashboard
- Calcular estatísticas descritivas (média, mediana, percentis, desvio padrão)
- Construir curvas vintage por safra de originação
- Gerar matrizes de transição de rating
- Agregar e segmentar dados por qualquer dimensão
- Buscar termos no glossário de negócio

## Guia de seleção de ferramentas

- **read_dashboard_state** → Quando o dashboard tem indicadores visíveis e a pergunta pode ser respondida com eles. Use PRIMEIRO.
- **list_validated_queries** → Reuso de SQL: SEMPRE chame list_validated_queries antes de gerar SQL novo. Se houver match com score >= 0.8 ou source === 'curated', reuse o SQL adaptando filtros. Caso contrário, prossiga com geração.
- **save_validated_query** → Após execute_sql bem-sucedido com SQL reutilizável, sugira para o catálogo (gate humano via UI admin).
- **recall_similar_sql** → Antes de chamar execute_sql, considere chamar recall_similar_sql com a intent — se houver match com score ≥0.85 e schema compatível, reuse o SQL.
- **execute_sql** → Queries customizadas: rankings (top N devedores), segmentações (saldo por projeto), dados que nenhuma outra ferramenta fornece.
- **calculate_statistics** → Distribuição de UMA coluna numérica (média, mediana, percentis). Use para "como está distribuído o LTV?".
- **build_vintage_curves** → Evolução de inadimplência por safra. Use para "como estão as safras?" ou "vintage curves".
- **build_transition_matrix** → Migração de rating entre períodos. Use para "como os ratings evoluíram?".
- **get_table_schema** → Quando não sabe qual coluna usar. Use ANTES de execute_sql se ambíguo.
- **get_sample_data** → Para ver exemplos de dados reais. Use para validar entendimento.
- **lookup_glossary** → Definições de termos ("o que é LTV?", "como funciona PDD?").

## Regra fundamental
**NUNCA pergunte ao usuário o que ele quer ver.** Quando pedirem um resumo, forneça o resumo completo. Quando perguntarem sobre um indicador, responda com o valor e análise.

## Benchmarks (crédito imobiliário securitizado)
| Indicador | Saudável | Atenção | Crítico |
|-----------|----------|---------|---------|
| Inadimplência | < 3% | 3% – 7% | > 7% |
| Over 90 | < 2% | 2% – 5% | > 5% |
| LTV médio | < 60% | 60% – 75% | > 75% |
| PDD / Saldo devedor | < 2% | 2% – 5% | > 5% |
| Elegibilidade | > 90% | 70% – 90% | < 70% |

## Tom e estilo
- **Seja extremamente conciso.** Máximo 8-10 linhas para resumos.
- Use bullet points curtos. Omita valores que estão em zero ou sem variação.
- Foque no que é relevante: alertas, tendências, destaques.
- Nunca repita a estrutura "Indicador: valor, variação: X%" para cada KPI. Sintetize.`;
}

export function buildDescriptiveAgentPrompt(ctx: AgentDynamicContext): string {
  const semanticSections = renderSemanticContextSections(ctx.semanticContext);
  const semanticContextSection = semanticSections ? `\n${semanticSections}\n` : '';
  const hasIndicators = ctx.dashboardState && ctx.dashboardState.trim().length > 0 && !ctx.dashboardState.includes('Nenhum indicador carregado');
  const indicatorsSection = hasIndicators
    ? `\n## Estado atual do dashboard\n\n${ctx.dashboardState}\n\n> Os indicadores acima já estão visíveis na tela do usuário. Responda DIRETAMENTE usando esses dados quando suficientes. Só consulte o BigQuery se precisar de dados que NÃO estão nos indicadores acima.\n`
    : '';
  return `${buildDescriptiveStatic()}

${SQL_RULES}

${buildSchemaContext()}

${buildBusinessContext()}

${buildDynamicFilterContext(ctx)}
${semanticContextSection}${indicatorsSection}
${RESPONSE_GUIDELINES}`;
}
```

Aplique o MESMO padrão aos outros 7 builders e ao orchestrator, preservando o texto VERBATIM de cada um:
- **diagnostic**: static = persona + capacidades + guia + metodologia + tabela polaridade + tabela HHI. Recompõe com SQL_RULES/schema/business/filter/RESPONSE.
- **predictive**: static = persona + capacidades + guia + metodologia BQML + uso forecast + survival + PD/LGD/EAD + CPR/CDR + **Early Warning Signals** + disciplina BQML + decision tree + ressalvas. Recompõe (note: filter vem ANTES da disciplina BQML no original — mantenha a ordem original do arquivo).
- **prescriptive**: static = persona + capacidades + **Tipos de ações (Cobrança/Repasse/Reestruturação)** + metodologia + tools. Recompõe.
- **monitoring**: static = persona + capacidades + **Regras regulatórias (CVM 60 + Elegibilidade CRI + Covenants table + fórmulas + severidade)** + detecção anomalias + disciplina BQML + formato de alerta. Recompõe.
- **simulation**: static = persona + capacidades + guia + **Cenários pré-definidos** + sensibilidade + orientações + tools + nota de dataset. Recompõe.
- **external**: static = persona + capacidades + **Códigos BCB SGS** + **Correlações com a carteira** + fontes + orientações + fallbacks + tools + get_market_benchmarks. Recompõe.
- **cashflow**: static = persona + capacidades + **Métricas-chave (WAL/Excess Spread/Coverage/Haircut/tipos pagamento)**. Recompõe.
- **orchestrator**: `buildOrchestratorStatic()` = tudo de `buildOrchestratorPrompt` EXCETO `focusedSection`/`indicatorsSection`/"Contexto da sessão" (esses já foram para `buildOrchestratorDynamicContext` na Task 1). `buildOrchestratorPrompt(ctx)` recompõe como `[buildOrchestratorStatic(), buildOrchestratorDynamicContext(ctx)].join('\n\n')` — importando de `./dynamic-context`.

Adicione ao barrel `index.ts` os re-exports dos novos `buildXStatic`/`buildOrchestratorStatic` (e `buildAgentDynamicContext`/`buildOrchestratorDynamicContext`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/shared/config/agents/static-builders.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check + commit**

```bash
pnpm exec tsc --noEmit
git add src/shared/config/agents/
git commit -m "refactor(ai-studio): extrai buildXStatic() dos 8 builders + orchestrator (estático separado do dinâmico)"
```

---

### Task 3: Skill playbooks + seed manifest reescrito + reseed `--force`

**Files:**
- Create: `src/features/ai-studio/seed/skill-playbooks.ts`
- Modify: `src/features/ai-studio/seed/manifest.ts`
- Modify: `src/features/ai-studio/seed/ensure-seed.ts`
- Modify: `scripts/seed-ai-studio.ts`
- Test: `src/features/ai-studio/seed/manifest.test.ts`, `src/features/ai-studio/seed/ensure-seed.test.ts`

**Interfaces:**
- Consumes: `buildXStatic`/`buildOrchestratorStatic` (Task 2); `SQL_RULES`, `RESPONSE_GUIDELINES`, `buildSchemaContext()`, `buildBusinessContext()` de `@/shared/config/agents`.
- Produces: `SYSTEM_SEEDS` com 9 agentes (instruções completas, `skillRefs` = 4 skills, `model` tier) + 4 skills + workflow + KB. `ensureSeed(db?, opts?: { force?: boolean })`.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/features/ai-studio/seed/manifest.test.ts
import { describe, it, expect } from 'vitest';
import { SYSTEM_SEEDS } from './manifest';

const byType = (t: string) => SYSTEM_SEEDS.filter((s) => s.type === t);

describe('SYSTEM_SEEDS', () => {
  it('tem 9 agentes, 4 skills, 1 workflow, 1 KB', () => {
    expect(byType('agent')).toHaveLength(9);
    expect(byType('skill')).toHaveLength(4);
    expect(byType('workflow')).toHaveLength(1);
    expect(byType('knowledgeBase')).toHaveLength(1);
  });

  it('instruções dos agentes são completas (não one-liner)', () => {
    for (const a of byType('agent')) {
      expect(String(a.doc.instructions).length).toBeGreaterThan(200);
    }
  });

  it('os 8 sub-agentes referenciam as 4 skills; orchestrator não', () => {
    const skills = ['response-style', 'sql-foundations', 'portfolio-schema', 'credit-domain'];
    for (const a of byType('agent')) {
      if (a.id === 'orchestrator') { expect(a.doc.skillRefs).toEqual([]); continue; }
      expect([...(a.doc.skillRefs as string[])].sort()).toEqual([...skills].sort());
    }
  });

  it('model usa tiers válidos (router/fast/reasoning)', () => {
    const tiers = new Set(byType('agent').map((a) => a.doc.model));
    for (const t of tiers) expect(['router', 'fast', 'reasoning']).toContain(t);
    expect(SYSTEM_SEEDS.find((s) => s.id === 'diagnostic')!.doc.model).toBe('reasoning');
    expect(SYSTEM_SEEDS.find((s) => s.id === 'descriptive')!.doc.model).toBe('fast');
    expect(SYSTEM_SEEDS.find((s) => s.id === 'orchestrator')!.doc.model).toBe('router');
  });

  it('toolRefs vazias (tools code-wired nesta fase)', () => {
    for (const a of byType('agent')) expect(a.doc.toolRefs).toEqual([]);
    for (const s of byType('skill')) expect(s.doc.toolRefs).toEqual([]);
  });

  it('skills carregam o playbook canônico', () => {
    const credit = SYSTEM_SEEDS.find((s) => s.type === 'skill' && s.id === 'credit-domain')!;
    expect(String(credit.doc.playbook)).toContain('Glossário de termos');
    const sql = SYSTEM_SEEDS.find((s) => s.type === 'skill' && s.id === 'sql-foundations')!;
    expect(String(sql.doc.playbook)).toContain('APENAS SELECT');
  });
});
```

```typescript
// src/features/ai-studio/seed/ensure-seed.test.ts
import { describe, it, expect, vi } from 'vitest';

function fakeDb(existing: Record<string, { origin?: string }>) {
  const sets: Array<{ id: string; data: Record<string, unknown> }> = [];
  return {
    sets,
    collection: () => ({
      doc: (id: string) => ({
        get: async () => ({ exists: !!existing[id], data: () => existing[id] }),
        set: async (data: Record<string, unknown>) => { sets.push({ id, data }); existing[id] = data as never; },
      }),
    }),
  } as never;
}

import { ensureSeed } from './ensure-seed';

describe('ensureSeed', () => {
  it('sem force: cria ausentes, preserva existentes', async () => {
    const db = fakeDb({ descriptive: { origin: 'system' } });
    await ensureSeed(db);
    expect(db.sets.find((s) => s.id === 'descriptive')).toBeUndefined(); // existente preservado
    expect(db.sets.find((s) => s.id === 'orchestrator')).toBeDefined();  // ausente criado
  });

  it('force: sobrescreve origin:system, preserva origin:user', async () => {
    const db = fakeDb({ descriptive: { origin: 'system' }, 'minha-skill': { origin: 'user' } });
    await ensureSeed(db, { force: true });
    expect(db.sets.find((s) => s.id === 'descriptive')).toBeDefined(); // system sobrescrito
    // doc origin:user nunca está nos SYSTEM_SEEDS, então nunca é tocado — não há set para ele
    expect(db.sets.find((s) => s.id === 'minha-skill')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/features/ai-studio/seed/`
Expected: FAIL — counts wrong (5 seeds hoje), `skill-playbooks` ausente, `ensureSeed` não aceita opts.

- [ ] **Step 3: Implement skill-playbooks.ts**

```typescript
// src/features/ai-studio/seed/skill-playbooks.ts
import { SQL_RULES, RESPONSE_GUIDELINES, buildSchemaContext, buildBusinessContext } from '@/shared/config/agents';

/** Textos canônicos das 4 skills de sistema (espelham os helpers compartilhados). */
export const RESPONSE_STYLE_PLAYBOOK = RESPONSE_GUIDELINES;
export const SQL_FOUNDATIONS_PLAYBOOK = SQL_RULES;
export const PORTFOLIO_SCHEMA_PLAYBOOK = buildSchemaContext();
export const CREDIT_DOMAIN_PLAYBOOK = buildBusinessContext();
```

*(Confirme que `@/shared/config/agents` (barrel) re-exporta `SQL_RULES`, `RESPONSE_GUIDELINES`, `buildSchemaContext`, `buildBusinessContext`; se não, importe de `@/shared/config/agents/shared-context`.)*

- [ ] **Step 4: Rewrite manifest.ts**

```typescript
import type { AiEntityType } from '../protection';
import {
  buildDescriptiveStatic, buildDiagnosticStatic, buildPredictiveStatic, buildPrescriptiveStatic,
  buildMonitoringStatic, buildSimulationStatic, buildExternalStatic, buildCashflowStatic, buildOrchestratorStatic,
} from '@/shared/config/agents';
import { RESPONSE_STYLE_PLAYBOOK, SQL_FOUNDATIONS_PLAYBOOK, PORTFOLIO_SCHEMA_PLAYBOOK, CREDIT_DOMAIN_PLAYBOOK } from './skill-playbooks';

export interface SeedRecord { type: AiEntityType; id: string; doc: Record<string, unknown>; }

const SUB_AGENT_SKILLS = ['response-style', 'sql-foundations', 'portfolio-schema', 'credit-domain'];

function agent(id: string, name: string, instructions: string, model: string, extra: Record<string, unknown> = {}): SeedRecord {
  return {
    type: 'agent', id,
    doc: {
      name, instructions, kind: 'worker', model, status: 'active',
      origin: 'system', systemKey: id, description: name,
      skillRefs: id === 'orchestrator' ? [] : SUB_AGENT_SKILLS, toolRefs: [], knowledgeBaseRefs: [],
      ...extra,
    },
  };
}

function skill(id: string, name: string, description: string, playbook: string): SeedRecord {
  return {
    type: 'skill', id,
    doc: { name, description, playbook, toolRefs: [], knowledgeBaseRefs: [], status: 'active', origin: 'system', systemKey: id },
  };
}

export const SYSTEM_SEEDS: SeedRecord[] = [
  agent('orchestrator', 'Supervisor Analítico', buildOrchestratorStatic(), 'router', { kind: 'orchestrator' }),
  agent('descriptive', 'Agente Descritivo', buildDescriptiveStatic(), 'fast'),
  agent('diagnostic', 'Agente Diagnóstico', buildDiagnosticStatic(), 'reasoning'),
  agent('predictive', 'Agente Preditivo', buildPredictiveStatic(), 'reasoning'),
  agent('prescriptive', 'Agente Prescritivo', buildPrescriptiveStatic(), 'reasoning'),
  agent('monitoring', 'Agente de Monitoramento', buildMonitoringStatic(), 'reasoning'),
  agent('simulation', 'Agente de Simulação', buildSimulationStatic(), 'reasoning'),
  agent('external', 'Agente Externo', buildExternalStatic(), 'fast'),
  agent('cashflow', 'Agente de Fluxo de Caixa', buildCashflowStatic(), 'fast'),
  skill('response-style', 'Estilo de Resposta', 'Regras de resposta (pt-BR, concisão, ask_user, tratamento de erro).', RESPONSE_STYLE_PLAYBOOK),
  skill('sql-foundations', 'Fundamentos SQL', 'Regras de SQL (SELECT-only, SAFE_DIVIDE, formatação).', SQL_FOUNDATIONS_PLAYBOOK),
  skill('portfolio-schema', 'Schema da Carteira', 'Documentação das tabelas BigQuery (contratos/pagamentos/fluxo_caixa).', PORTFOLIO_SCHEMA_PLAYBOOK),
  skill('credit-domain', 'Domínio de Crédito', 'Glossário, escala de rating, PDD/Res. 2682 e fórmulas.', CREDIT_DOMAIN_PLAYBOOK),
  {
    type: 'workflow', id: 'default',
    doc: {
      name: 'Atendimento Analítico Padrão',
      description: 'Fluxo padrão para qualquer pergunta analítica sobre a carteira de crédito.',
      instruction: 'Ao receber um comando, identifique a intenção (descritiva, diagnóstica, preditiva, prescritiva). Acione o(s) agente(s) correspondente(s), priorizando dados reais via SQL, e componha uma resposta clara com citações de fonte quando houver afirmação numérica ou regulatória.',
      isDefault: true, status: 'active', origin: 'system', systemKey: 'default',
    },
  },
  {
    type: 'knowledgeBase', id: 'default',
    doc: {
      name: 'Base de Conhecimento Padrão',
      description: 'Documentos gerais (mercado, produto, negócio) — absorve os embeddings legados.',
      clientId: null, embeddingModel: 'gemini-embedding-001', docCount: 0, chunkCount: 0,
      status: 'active', origin: 'system', systemKey: 'default',
    },
  },
];

const COLLECTION_BY_TYPE: Record<AiEntityType, string> = {
  agent: 'aiAgents', skill: 'aiSkills', workflow: 'aiWorkflows', knowledgeBase: 'knowledgeBases',
};
export function collectionForType(type: AiEntityType): string { return COLLECTION_BY_TYPE[type]; }
export function getSeed(type: AiEntityType, id: string): SeedRecord | undefined {
  return SYSTEM_SEEDS.find((s) => s.type === type && s.id === id);
}
```

- [ ] **Step 5: Update ensure-seed.ts (`--force`)**

```typescript
import { FieldValue } from 'firebase-admin/firestore';
import { SYSTEM_SEEDS, collectionForType } from './manifest';

export interface EnsureSeedOptions { force?: boolean; }

/**
 * Idempotente: cria docs de sistema ausentes. Com `force`, sobrescreve docs
 * EXISTENTES de `origin:'system'` (atualiza conteúdo); nunca toca `origin:'user'`.
 */
export async function ensureSeed(db?: FirebaseFirestore.Firestore, opts: EnsureSeedOptions = {}): Promise<void> {
  const firestore = db ?? (await import('@/shared/lib/firebase/admin')).getDb();
  for (const seed of SYSTEM_SEEDS) {
    const ref = firestore.collection(collectionForType(seed.type)).doc(seed.id);
    const snap = await ref.get();
    if (snap.exists) {
      const data = snap.data() as { origin?: string } | undefined;
      if (!opts.force || data?.origin !== 'system') continue; // preserva user e (sem force) tudo
      await ref.set(
        { ...seed.doc, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
      continue;
    }
    await ref.set({ ...seed.doc, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  }
}
```

- [ ] **Step 6: Update scripts/seed-ai-studio.ts**

```typescript
import { ensureSeed } from '@/features/ai-studio/seed/ensure-seed';
import { getSeedDb } from './_firestore-admin';

async function main() {
  const force = process.argv.includes('--force');
  const db = getSeedDb();
  await ensureSeed(db, { force });
  console.log(`[seed:ai-studio] seeds de sistema garantidos (force=${force}).`);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 7: Run tests + type-check**

Run: `pnpm exec vitest run src/features/ai-studio/seed/ && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/features/ai-studio/seed/ scripts/seed-ai-studio.ts
git commit -m "feat(ai-studio): seed com instruções completas + 4 skills + reseed --force"
```

---

### Task 4: `resolve-agent.ts` + `resolve-capabilities.ts` (sem flag, fallback resiliente)

**Files:**
- Modify: `src/features/ai-studio/runtime/resolve-agent.ts`
- Modify: `src/features/ai-studio/runtime/resolve-capabilities.ts`
- Modify: `src/features/ai-studio/runtime/resolve-agent.test.ts` (se existir; senão criar) e `resolve-capabilities.test.ts`

**Interfaces:**
- Produces: `resolveAgentInstructions(systemKey: string, codeFallback: string): Promise<string>`; `resolveAgentCapabilities(systemKey: string): Promise<AgentCapabilities>`.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/features/ai-studio/runtime/resolve-agent.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
const h = vi.hoisted(() => ({ loadAgentConfigMock: vi.fn(), loadSkillPlaybooksMock: vi.fn() }));
vi.mock('./config-loader', () => ({ loadAgentConfig: h.loadAgentConfigMock, loadSkillPlaybooks: h.loadSkillPlaybooksMock }));
import { resolveAgentInstructions } from './resolve-agent';

beforeEach(() => { h.loadAgentConfigMock.mockReset(); h.loadSkillPlaybooksMock.mockReset(); h.loadSkillPlaybooksMock.mockResolvedValue([]); });

describe('resolveAgentInstructions (sem flag)', () => {
  it('config presente → instructions + playbooks', async () => {
    h.loadAgentConfigMock.mockResolvedValue({ instructions: 'CFG', skillRefs: ['s1'] });
    h.loadSkillPlaybooksMock.mockResolvedValue(['## Skill: S1\nP1']);
    expect(await resolveAgentInstructions('descriptive', 'CODE')).toBe('CFG\n\n## Skill: S1\nP1');
  });
  it('config ausente/vazia → codeFallback', async () => {
    h.loadAgentConfigMock.mockResolvedValue(null);
    expect(await resolveAgentInstructions('descriptive', 'CODE')).toBe('CODE');
    h.loadAgentConfigMock.mockResolvedValue({ instructions: '   ' });
    expect(await resolveAgentInstructions('descriptive', 'CODE')).toBe('CODE');
  });
  it('erro → codeFallback (resiliente)', async () => {
    h.loadAgentConfigMock.mockRejectedValue(new Error('firestore down'));
    expect(await resolveAgentInstructions('descriptive', 'CODE')).toBe('CODE');
  });
});
```

```typescript
// src/features/ai-studio/runtime/resolve-capabilities.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
const h = vi.hoisted(() => ({ loadAgentConfigMock: vi.fn(), loadSkillsMock: vi.fn() }));
vi.mock('./config-loader', () => ({ loadAgentConfig: h.loadAgentConfigMock, loadSkills: h.loadSkillsMock }));
import { resolveAgentCapabilities } from './resolve-capabilities';

beforeEach(() => { h.loadAgentConfigMock.mockReset(); h.loadSkillsMock.mockReset(); h.loadSkillsMock.mockResolvedValue([]); });

describe('resolveAgentCapabilities (sem flag)', () => {
  it('une agent ∪ skill toolRefs/kbRefs', async () => {
    h.loadAgentConfigMock.mockResolvedValue({ toolRefs: ['t1'], knowledgeBaseRefs: ['kb1'], skillRefs: ['s1'] });
    h.loadSkillsMock.mockResolvedValue([{ toolRefs: ['t2'], knowledgeBaseRefs: ['kb2'] }]);
    const caps = await resolveAgentCapabilities('descriptive');
    expect([...caps.toolKeys].sort()).toEqual(['t1', 't2']);
    expect([...caps.kbRefs].sort()).toEqual(['kb1', 'kb2']);
  });
  it('toolRefs vazias → vazio', async () => {
    h.loadAgentConfigMock.mockResolvedValue({ toolRefs: [], knowledgeBaseRefs: [], skillRefs: [] });
    expect(await resolveAgentCapabilities('descriptive')).toEqual({ toolKeys: [], kbRefs: [] });
  });
  it('erro → vazio (fail-soft)', async () => {
    h.loadAgentConfigMock.mockRejectedValue(new Error('x'));
    expect(await resolveAgentCapabilities('descriptive')).toEqual({ toolKeys: [], kbRefs: [] });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/features/ai-studio/runtime/resolve-agent.test.ts src/features/ai-studio/runtime/resolve-capabilities.test.ts`
Expected: FAIL — assinaturas antigas (com `flagOn`/objeto).

- [ ] **Step 3: Rewrite resolve-agent.ts**

```typescript
import { loadAgentConfig, loadSkillPlaybooks } from './config-loader';

/**
 * Instrução final estática do agente: config (Firestore) + playbooks das skills.
 * Em ausência/erro → codeFallback (baseline em código). Nunca vazia. Resiliente.
 */
export async function resolveAgentInstructions(systemKey: string, codeFallback: string): Promise<string> {
  try {
    const cfg = await loadAgentConfig(systemKey);
    if (cfg && typeof cfg.instructions === 'string' && cfg.instructions.trim()) {
      const playbooks = await loadSkillPlaybooks((cfg.skillRefs as string[]) ?? []);
      return [cfg.instructions, ...playbooks].join('\n\n');
    }
  } catch {
    // resiliente: cai no baseline de código
  }
  return codeFallback;
}
```

- [ ] **Step 4: Rewrite resolve-capabilities.ts**

```typescript
import { loadAgentConfig, loadSkills } from './config-loader';

export interface AgentCapabilities { toolKeys: string[]; kbRefs: string[]; }
const EMPTY: AgentCapabilities = { toolKeys: [], kbRefs: [] };

/** Une as capacidades declaradas pelo agente e pelas skills. Erro → vazio (fail-soft). */
export async function resolveAgentCapabilities(systemKey: string): Promise<AgentCapabilities> {
  try {
    const agent = await loadAgentConfig(systemKey);
    if (!agent) return EMPTY;
    const skills = await loadSkills((agent.skillRefs as string[] | undefined) ?? []);
    const toolKeys = new Set<string>((agent.toolRefs as string[] | undefined) ?? []);
    const kbRefs = new Set<string>((agent.knowledgeBaseRefs as string[] | undefined) ?? []);
    for (const skill of skills) {
      for (const t of (skill.toolRefs as string[] | undefined) ?? []) toolKeys.add(t);
      for (const k of (skill.knowledgeBaseRefs as string[] | undefined) ?? []) kbRefs.add(k);
    }
    return { toolKeys: Array.from(toolKeys), kbRefs: Array.from(kbRefs) };
  } catch {
    return EMPTY;
  }
}
```

- [ ] **Step 5: Run tests + commit**

Run: `pnpm exec vitest run src/features/ai-studio/runtime/resolve-agent.test.ts src/features/ai-studio/runtime/resolve-capabilities.test.ts`
Expected: PASS.

```bash
git add src/features/ai-studio/runtime/resolve-agent.ts src/features/ai-studio/runtime/resolve-capabilities.ts src/features/ai-studio/runtime/resolve-agent.test.ts src/features/ai-studio/runtime/resolve-capabilities.test.ts
git commit -m "refactor(ai-studio): resolve-agent/capabilities sem flag, fallback resiliente"
```

---

### Task 5: `create-mastra-agent-from-config.ts` + os 8 adaptadores (compõe static+dynamic, model da config)

**Files:**
- Modify: `src/features/ai-agents/mastra/create-mastra-agent-from-config.ts`
- Modify: `src/features/ai-agents/mastra/{descriptive,diagnostic,predictive,prescriptive,monitoring,simulation,external,cashflow}-agent-mastra.ts`
- Modify: `src/features/ai-agents/mastra/create-mastra-agent-from-config.test.ts`, `descriptive-agent-mastra.skills.test.ts`

**Interfaces:**
- Consumes: `resolveAgentInstructions(systemKey, codeFallback)`, `resolveAgentCapabilities(systemKey)` (Task 4); `buildAgentDynamicContext(ctx)` (Task 1); `buildXStatic` + `SQL_RULES`/`RESPONSE_GUIDELINES`/`buildSchemaContext`/`buildBusinessContext` (Task 2); `getModel(tier)` + `ModelTier`.
- Produces: `createMastraAgentFromConfig` com input `{ systemKey, name, description, defaultModelTier, buildStatic, buildToolsFactory, ctx }`.

- [ ] **Step 1: Update the failing test**

```typescript
// src/features/ai-agents/mastra/create-mastra-agent-from-config.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
const h = vi.hoisted(() => ({
  resolveCapsMock: vi.fn(), buildFromKeysMock: vi.fn(), loadAgentConfigMock: vi.fn(),
  createKbToolMock: vi.fn(), resolveInstrMock: vi.fn(), getModelMock: vi.fn(), dynMock: vi.fn(),
}));
vi.mock('@/features/ai-studio/runtime/resolve-capabilities', () => ({ resolveAgentCapabilities: h.resolveCapsMock }));
vi.mock('@/features/ai-studio/runtime/tool-registry', () => ({ buildToolsFromKeys: h.buildFromKeysMock }));
vi.mock('@/features/ai-studio/runtime/config-loader', () => ({ loadAgentConfig: h.loadAgentConfigMock }));
vi.mock('@/features/ai-studio/runtime/kb-retrieval-tool', () => ({ createKbRetrievalTool: h.createKbToolMock }));
vi.mock('@/features/ai-studio/runtime/resolve-agent', () => ({ resolveAgentInstructions: h.resolveInstrMock }));
vi.mock('@/features/ai-agents/model-registry', () => ({ getModel: h.getModelMock }));
vi.mock('@/shared/config/agents/dynamic-context', () => ({ buildAgentDynamicContext: h.dynMock }));
vi.mock('@mastra/core/agent', () => ({ Agent: vi.fn(function (cfg: unknown) { return { cfg }; }) }));

import { createMastraAgentFromConfig } from './create-mastra-agent-from-config';
import { Agent } from '@mastra/core/agent';

const ctx = { clientId: 'OM', personaId: 'p', dataset: 'om', filters: {}, sessionId: 's' } as never;
function lastCfg() { return (Agent as unknown as { mock: { calls: Array<[Record<string, unknown>]> } }).mock.calls.at(-1)![0]; }
function input(over = {}) {
  return { systemKey: 'diagnostic', name: 'Diag', description: 'desc', defaultModelTier: 'reasoning', buildStatic: () => 'STATIC', buildToolsFactory: () => ({ execute_sql: 'BASE' }), ctx, ...over } as never;
}
beforeEach(() => {
  Object.values(h).forEach((m) => m.mockReset());
  h.resolveInstrMock.mockResolvedValue('INSTR'); h.resolveCapsMock.mockResolvedValue({ toolKeys: [], kbRefs: [] });
  h.buildFromKeysMock.mockReturnValue({}); h.loadAgentConfigMock.mockResolvedValue(null);
  h.getModelMock.mockReturnValue('MODEL'); h.dynMock.mockReturnValue('DYNAMIC');
  (Agent as unknown as { mockClear: () => void }).mockClear();
});

describe('createMastraAgentFromConfig', () => {
  it('instructions = resolve + dynamic anexado; tools = base; id correto', async () => {
    await createMastraAgentFromConfig(input());
    expect(h.resolveCapsMock).toHaveBeenCalledWith('diagnostic');
    expect(h.resolveInstrMock).toHaveBeenCalledWith('diagnostic', expect.stringContaining('STATIC'));
    const cfg = lastCfg();
    expect(cfg.id).toBe('diagnostic_agent');
    expect(cfg.instructions).toBe('INSTR\n\nDYNAMIC');
    expect(cfg.tools).toEqual({ execute_sql: 'BASE' });
  });
  it('model = getModel(cfg.model) quando config define tier', async () => {
    h.loadAgentConfigMock.mockResolvedValue({ model: 'fast' });
    await createMastraAgentFromConfig(input());
    expect(h.getModelMock).toHaveBeenCalledWith('fast');
  });
  it('model = getModel(defaultModelTier) quando config ausente', async () => {
    h.loadAgentConfigMock.mockResolvedValue(null);
    await createMastraAgentFromConfig(input());
    expect(h.getModelMock).toHaveBeenCalledWith('reasoning');
  });
  it('toolKeys das skills entram aditivamente', async () => {
    h.resolveCapsMock.mockResolvedValue({ toolKeys: ['vector_query'], kbRefs: [] });
    h.buildFromKeysMock.mockReturnValue({ vector_query: 'GRANTED' });
    await createMastraAgentFromConfig(input());
    expect(lastCfg().tools.vector_query).toBe('GRANTED');
  });
  it('kbRefs (agent ∪ skill) → kb_retrieval', async () => {
    h.loadAgentConfigMock.mockResolvedValue({ knowledgeBaseRefs: ['kb-prod'] });
    h.resolveCapsMock.mockResolvedValue({ toolKeys: [], kbRefs: ['kb-mercado'] });
    h.createKbToolMock.mockReturnValue('KB');
    await createMastraAgentFromConfig(input());
    const arg = h.createKbToolMock.mock.calls.at(-1)![0];
    expect([...arg.knowledgeBaseRefs].sort()).toEqual(['kb-mercado', 'kb-prod']);
    expect(lastCfg().tools.kb_retrieval).toBe('KB');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/features/ai-agents/mastra/create-mastra-agent-from-config.test.ts`
Expected: FAIL — input antigo (`model`/`buildSystemPrompt`/`flagOn`).

- [ ] **Step 3: Rewrite create-mastra-agent-from-config.ts**

```typescript
import { Agent } from '@mastra/core/agent';
import type { AgentDynamicContext, ModelTier } from '@/shared/config/agents/types';
import { SQL_RULES, RESPONSE_GUIDELINES, buildSchemaContext, buildBusinessContext } from '@/shared/config/agents';
import { buildAgentDynamicContext } from '@/shared/config/agents/dynamic-context';
import { getModel } from '@/features/ai-agents/model-registry';
import { resolveAgentInstructions } from '@/features/ai-studio/runtime/resolve-agent';
import { resolveAgentCapabilities } from '@/features/ai-studio/runtime/resolve-capabilities';
import { loadAgentConfig } from '@/features/ai-studio/runtime/config-loader';
import { buildToolsFromKeys } from '@/features/ai-studio/runtime/tool-registry';
import { createKbRetrievalTool } from '@/features/ai-studio/runtime/kb-retrieval-tool';

export interface MastraAgentFactoryInput {
  systemKey: string;
  name: string;
  description: string;
  defaultModelTier: ModelTier;                       // tier real do agente (fallback se config ausente)
  buildStatic: () => string;                          // texto estático do agente (Task 2)
  buildToolsFactory: (ctx: AgentDynamicContext) => Record<string, unknown>;
  ctx: AgentDynamicContext;
}

/** Baseline em código = estático do agente + as 4 skills compartilhadas (espelha a config). */
function composeCodeBaseline(buildStatic: () => string): string {
  return [buildStatic(), RESPONSE_GUIDELINES, SQL_RULES, buildSchemaContext(), buildBusinessContext()].join('\n\n');
}

export async function createMastraAgentFromConfig(input: MastraAgentFactoryInput): Promise<Agent> {
  const { systemKey, name, description, defaultModelTier, buildStatic, buildToolsFactory, ctx } = input;

  const cfg = await loadAgentConfig(systemKey).catch(() => null);
  const tier = ((cfg?.model as ModelTier | undefined) ?? defaultModelTier);

  const instructions = [
    await resolveAgentInstructions(systemKey, composeCodeBaseline(buildStatic)),
    buildAgentDynamicContext(ctx),
  ].join('\n\n');

  const tools = buildToolsFactory(ctx) as Record<string, unknown>;
  const caps = await resolveAgentCapabilities(systemKey);
  Object.assign(tools, buildToolsFromKeys(caps.toolKeys, ctx));

  const kbRefs = Array.from(new Set([...((cfg?.knowledgeBaseRefs as string[] | undefined) ?? []), ...caps.kbRefs]));
  if (kbRefs.length > 0) {
    try {
      tools.kb_retrieval = createKbRetrievalTool({ clientId: (ctx as { clientId?: string }).clientId, knowledgeBaseRefs: kbRefs });
    } catch { /* fail-soft */ }
  }

  return new Agent({
    id: `${systemKey}_agent`,
    name, description, instructions,
    model: getModel(tier) as never,
    tools: tools as never,
  });
}
```

- [ ] **Step 4: Update the 8 adaptadores**

Exemplo `descriptive-agent-mastra.ts`:

```typescript
import type { Agent } from '@mastra/core/agent';
import { buildDescriptiveStatic } from '@/shared/config/agents';
import type { AgentDynamicContext } from '@/shared/config/agents/types';
import { buildDescriptiveAgentTools } from '../agents/descriptive-agent';
import { createMastraAgentFromConfig } from './create-mastra-agent-from-config';

export async function createDescriptiveAgentMastra(input: { ctx: AgentDynamicContext }): Promise<Agent> {
  return createMastraAgentFromConfig({
    systemKey: 'descriptive',
    name: 'Descriptive Agent',
    description: 'Analisa dados da carteira: resumos, KPIs, estatísticas descritivas, curvas vintage, matrizes de transição e consultas SQL.',
    defaultModelTier: 'fast',
    buildStatic: buildDescriptiveStatic,
    buildToolsFactory: buildDescriptiveAgentTools,
    ctx: input.ctx,
  });
}
```

Aplique aos outros 7 (mantendo `name`/`description` atuais de cada adaptador):
- diagnostic → `buildDiagnosticStatic`, `buildDiagnosticAgentTools`, `defaultModelTier: 'reasoning'`
- predictive → `buildPredictiveStatic`, `buildPredictiveAgentTools`, `'reasoning'`
- prescriptive → `buildPrescriptiveStatic`, `buildPrescriptiveAgentTools`, `'reasoning'`
- monitoring → `buildMonitoringStatic`, `buildMonitoringAgentTools`, `'reasoning'`
- simulation → `buildSimulationStatic`, `buildSimulationAgentTools`, `'reasoning'`
- external → `buildExternalStatic`, `buildExternalAgentTools`, `'fast'`
- cashflow → `buildCashflowStatic`, `buildCashflowAgentTools`, `'fast'`

Remova os imports de `vertex` dos adaptadores (não usam mais).

- [ ] **Step 5: Update descriptive-agent-mastra.skills.test.ts**

Atualize os mocks: remova os `process.env.AI_STUDIO_*`; adicione `vi.mock('@/features/ai-agents/model-registry', () => ({ getModel: () => 'model' }))` e `vi.mock('@/shared/config/agents/dynamic-context', () => ({ buildAgentDynamicContext: () => 'DYN' }))`; troque o mock de `@/shared/config/agents` para exportar `buildDescriptiveStatic: () => 'STATIC'` + os 4 textos (`SQL_RULES`/`RESPONSE_GUIDELINES`/`buildSchemaContext`/`buildBusinessContext`). Os asserts de tools (base + concedidas) permanecem, sem depender de flag.

```typescript
// trecho dos mocks novos (substituir os antigos de @/shared/config/agents e vertex)
vi.mock('@/shared/config/agents', () => ({
  buildDescriptiveStatic: () => 'STATIC',
  SQL_RULES: 'SQL', RESPONSE_GUIDELINES: 'RESP',
  buildSchemaContext: () => 'SCHEMA', buildBusinessContext: () => 'BIZ',
}));
vi.mock('@/features/ai-agents/model-registry', () => ({ getModel: () => 'model' }));
vi.mock('@/shared/config/agents/dynamic-context', () => ({ buildAgentDynamicContext: () => 'DYN' }));
// remover: vi.mock('@ai-sdk/google-vertex', ...) e os process.env.AI_STUDIO_* nos testes
```

- [ ] **Step 6: Run tests + type-check + build**

Run: `pnpm exec vitest run src/features/ai-agents/mastra/ && pnpm exec tsc --noEmit && pnpm build`
Expected: PASS / build verde.

- [ ] **Step 7: Commit**

```bash
git add src/features/ai-agents/mastra/
git commit -m "refactor(ai-studio): create-mastra compõe static+dynamic, model da config, sem flags"
```

---

### Task 6: `build-supervisor-agent.ts` (orchestrator da config + workflow + dynamic)

**Files:**
- Modify: `src/features/ai-agents/mastra/build-supervisor-agent.ts`
- Test: `src/features/ai-agents/mastra/build-supervisor-agent.test.ts`

**Interfaces:**
- Consumes: `resolveAgentInstructions('orchestrator', codeFallback)` (Task 4); `buildOrchestratorStatic()` + `buildOrchestratorDynamicContext(ctx)` (Tasks 1/2); `getModel('router')`.
- Produces: `buildSupervisorAgent(input): Promise<Agent>` (agora **async** — lê config).

- [ ] **Step 1: Write the failing test**

```typescript
// src/features/ai-agents/mastra/build-supervisor-agent.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
const h = vi.hoisted(() => ({ resolveInstrMock: vi.fn(), staticMock: vi.fn(), dynMock: vi.fn(), getModelMock: vi.fn() }));
vi.mock('@/features/ai-studio/runtime/resolve-agent', () => ({ resolveAgentInstructions: h.resolveInstrMock }));
vi.mock('@/shared/config/agents', () => ({ buildOrchestratorStatic: h.staticMock }));
vi.mock('@/shared/config/agents/dynamic-context', () => ({ buildOrchestratorDynamicContext: h.dynMock }));
vi.mock('@/features/ai-agents/model-registry', () => ({ getModel: h.getModelMock }));
vi.mock('@mastra/core/agent', () => ({ Agent: vi.fn(function (cfg: unknown) { return { cfg }; }) }));
import { buildSupervisorAgent } from './build-supervisor-agent';
import { Agent } from '@mastra/core/agent';

const ctx = { page: '/dashboard', dataset: 'om', filters: {}, sessionId: 's' } as never;
beforeEach(() => {
  Object.values(h).forEach((m) => m.mockReset());
  h.resolveInstrMock.mockResolvedValue('ORCH'); h.staticMock.mockReturnValue('ORCH_STATIC');
  h.dynMock.mockReturnValue('ORCH_DYN'); h.getModelMock.mockReturnValue('ROUTER');
  (Agent as unknown as { mockClear: () => void }).mockClear();
});

describe('buildSupervisorAgent', () => {
  it('instructions = orchestrator(config) + workflow + dynamic', async () => {
    await buildSupervisorAgent({ instruction: 'WF', ctx, subAgents: { descriptive: 'D' } });
    const cfg = (Agent as unknown as { mock: { calls: Array<[Record<string, unknown>]> } }).mock.calls.at(-1)![0];
    expect(cfg.instructions).toBe('ORCH\n\nWF\n\nORCH_DYN');
    expect(cfg.id).toBe('supervisor');
    expect(h.resolveInstrMock).toHaveBeenCalledWith('orchestrator', 'ORCH_STATIC');
    expect(cfg.agents).toEqual({ descriptive: 'D' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/features/ai-agents/mastra/build-supervisor-agent.test.ts`
Expected: FAIL — `buildSupervisorAgent` síncrono usando `buildOrchestratorPrompt`.

- [ ] **Step 3: Rewrite build-supervisor-agent.ts**

```typescript
import { Agent } from '@mastra/core/agent';
import { buildOrchestratorStatic } from '@/shared/config/agents';
import { buildOrchestratorDynamicContext } from '@/shared/config/agents/dynamic-context';
import { resolveAgentInstructions } from '@/features/ai-studio/runtime/resolve-agent';
import { getModel } from '@/features/ai-agents/model-registry';
import type { AgentDynamicContext } from '@/shared/config/agents/types';

export interface SupervisorAgentInput {
  instruction: string;                  // workflow.instruction
  ctx: AgentDynamicContext;
  subAgents: Record<string, unknown>;   // os 8 Mastra Agents
}

/**
 * Supervisor Mastra: instruções = orchestrator (config, fallback no estático de
 * código) + instrução do workflow + contexto dinâmico. Async (lê config).
 */
export async function buildSupervisorAgent(input: SupervisorAgentInput): Promise<Agent> {
  const orchestrator = await resolveAgentInstructions('orchestrator', buildOrchestratorStatic());
  const instructions = [orchestrator, input.instruction, buildOrchestratorDynamicContext(input.ctx)].join('\n\n');
  return new Agent({
    id: 'supervisor',
    name: 'Supervisor Analítico',
    description: 'Orquestra os sub-agentes analíticos conforme o workflow ativo.',
    instructions,
    model: getModel('router') as never,
    agents: input.subAgents as never,
  });
}
```

- [ ] **Step 4: Run test + commit**

Run: `pnpm exec vitest run src/features/ai-agents/mastra/build-supervisor-agent.test.ts`
Expected: PASS.

```bash
git add src/features/ai-agents/mastra/build-supervisor-agent.ts src/features/ai-agents/mastra/build-supervisor-agent.test.ts
git commit -m "refactor(ai-studio): supervisor usa orchestrator da config + dynamic (async)"
```

---

### Task 7: `resolve-chat-agent.ts` (sem flag, sempre roteia) + remover flags do app-store

**Files:**
- Modify: `app/api/chat/resolve-chat-agent.ts`
- Modify: `src/shared/stores/app-store.ts`
- Modify: `app/api/chat/__tests__/workflow-routing.test.ts`

**Interfaces:**
- `resolveChatAgent` agora aguarda `buildSupervisorAgent` (async). Sempre roteia via workflow; sem workflow ativo ou erro → `descriptive`.

- [ ] **Step 1: Update the failing test**

Atualize `workflow-routing.test.ts`: remova o `process.env.AI_STUDIO_WORKFLOWS`; `buildSupervisorAgent` é async (`mockResolvedValueOnce`); o caso "flag off" vira "sem workflows → descriptive".

```typescript
/* @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
const h = vi.hoisted(() => ({ loadWorkflowsMock: vi.fn(), selectWorkflowMock: vi.fn(), buildSupervisorMock: vi.fn() }));
vi.mock('@/features/ai-studio/runtime/config-loader', () => ({ loadWorkflows: h.loadWorkflowsMock }));
vi.mock('@/features/ai-studio/runtime/select-workflow', () => ({ selectWorkflow: h.selectWorkflowMock }));
vi.mock('@/features/ai-agents/mastra/build-supervisor-agent', () => ({ buildSupervisorAgent: h.buildSupervisorMock }));
import { resolveChatAgent, lastUserText } from '../resolve-chat-agent';

const ctx = { dataset: 'om', filters: {}, sessionId: 's' } as never;
function fakeMastra(agents: Record<string, unknown>) {
  return { getAgent: (k: string) => { const a = agents[k]; if (!a) throw new Error('no agent'); return a; } } as never;
}
const messages = [{ role: 'user', parts: [{ type: 'text', text: 'inadimplência subiu?' }] }] as never;
beforeEach(() => { Object.values(h).forEach((m) => m.mockReset()); });

describe('lastUserText', () => {
  it('extrai a última mensagem de user', () => {
    expect(lastUserText([{ role: 'user', parts: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }] as never)).toBe('a b');
  });
});

describe('resolveChatAgent (sem flag, sempre roteia)', () => {
  it('workflows ativos → supervisor', async () => {
    const mastra = fakeMastra({ descriptive: 'DESC', diagnostic: 'DIAG' });
    h.loadWorkflowsMock.mockResolvedValueOnce([{ id: 'default', isDefault: true, instruction: 'WF', status: 'active' }]);
    h.selectWorkflowMock.mockResolvedValueOnce({ id: 'default', instruction: 'WF' });
    h.buildSupervisorMock.mockResolvedValueOnce('SUPERVISOR');
    expect(await resolveChatAgent({ mastra, ctx, messages })).toBe('SUPERVISOR');
    expect(h.buildSupervisorMock.mock.calls.at(-1)![0].instruction).toBe('WF');
  });
  it('sem workflows → descriptive', async () => {
    const mastra = fakeMastra({ descriptive: 'DESC' });
    h.loadWorkflowsMock.mockResolvedValueOnce([]);
    expect(await resolveChatAgent({ mastra, ctx, messages })).toBe('DESC');
  });
  it('erro no routing → descriptive (fail-soft)', async () => {
    const mastra = fakeMastra({ descriptive: 'DESC' });
    h.loadWorkflowsMock.mockRejectedValueOnce(new Error('down'));
    expect(await resolveChatAgent({ mastra, ctx, messages })).toBe('DESC');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run app/api/chat/__tests__/workflow-routing.test.ts`
Expected: FAIL — ainda gateado por flag; `buildSupervisorAgent` síncrono.

- [ ] **Step 3: Rewrite resolve-chat-agent.ts**

Substitua o corpo de `resolveChatAgent` (mantenha `lastUserText` e `collectSubAgents` e `SUB_AGENT_KEYS`):

```typescript
export async function resolveChatAgent(input: {
  mastra: Mastra;
  ctx: AgentDynamicContext;
  messages: Array<{ role: string; parts?: Array<{ type: string; text?: string }> }>;
}): Promise<unknown> {
  const descriptive = input.mastra.getAgent('descriptive');
  try {
    const workflows = await loadWorkflows();
    if (workflows.length === 0) return descriptive;
    const command = lastUserText(input.messages);
    const wf = await selectWorkflow(command, workflows);
    const subAgents = collectSubAgents(input.mastra);
    return await buildSupervisorAgent({ instruction: String(wf.instruction ?? ''), ctx: input.ctx, subAgents });
  } catch (e) {
    console.error('[chat] workflow routing falhou — usando descriptive', e);
    return descriptive;
  }
}
```

- [ ] **Step 4: Remove flags do app-store.ts**

Em `src/shared/stores/app-store.ts`, remova as 4 declarações de tipo (`useAiStudioAgents/Kb/Skills/Workflows: boolean` + setters no tipo) e os 8 itens no objeto store (linhas ~302-316: os 4 defaults `false` + 4 setters). Remova qualquer setter no tipo da interface (`setUseAiStudio*`).

- [ ] **Step 5: Verify no flag references remain**

Run: `pnpm exec vitest run app/api/chat/__tests__/workflow-routing.test.ts`
Expected: PASS.

Run (grep — deve retornar zero ocorrências em código, exceto specs/plans/ADR):
`git grep -nE "AI_STUDIO_(AGENTS|KB|SKILLS|WORKFLOWS)|useAiStudio" -- 'src' 'app'`
Expected: nenhuma linha (qualquer match restante em `src`/`app` deve ser removido).

- [ ] **Step 6: Type-check + build + commit**

Run: `pnpm exec tsc --noEmit && pnpm build`
Expected: verde.

```bash
git add app/api/chat/resolve-chat-agent.ts app/api/chat/__tests__/workflow-routing.test.ts src/shared/stores/app-store.ts
git commit -m "refactor(ai-studio): chat sempre roteia via workflow; remove flags AI_STUDIO_* do app-store"
```

---

### Task 8: ADR-0017 (config canônica) + verificação integrada

**Files:**
- Create: `adrs/decisions/0017-ai-studio-config-canonica.md`
- Modify: `adrs/README.md` (índice — adicionar a linha do ADR-0017, seguindo o formato existente)

**Interfaces:** documentação. Sem código de runtime.

- [ ] **Step 1: Write ADR-0017 (formato Nygard, PT-BR)**

```markdown
# 17. AI Studio — Config Canônica (prompts data-driven, fim das flags)

Date: 2026-06-18

## Status

Accepted

Supersede o mecanismo de rollout faseado por flags (`AI_STUDIO_*`) das Fases 1–4. Complementa ADR-0016 (config data-driven), realizando-a por completo. Não altera ADR-0014 (Mastra runtime).

## Context

As Fases 1–4 introduziram instruções/skills/KB/workflows data-driven atrás de flags `AI_STUDIO_*` com fallback ao prompt de código (zero-regressão durante o desenvolvimento). Isso deixou dois caminhos divergentes: com flag on, os agentes liam instruções rasas do Firestore e **perdiam** o contexto dinâmico (schema, glossário, filtros, semantic) que o builder de código injeta. O produto não está em produção (sem clientes), então a complexidade do dual-source não se justifica.

## Decision

A configuração do AI Studio é a **fonte de verdade canônica** dos prompts:
- O texto estático (persona, guia de tools, domínio do agente) vive em `Agent.instructions`; conhecimento compartilhado em 4 skills de sistema (playbooks sempre injetados); o contexto dinâmico (filtros/schema/semantic/dashboard) é sempre anexado em runtime.
- As flags `AI_STUDIO_AGENTS/KB/SKILLS/WORKFLOWS` (env) e os espelhos `useAiStudio*` (app-store) são **removidos**.
- O runtime sempre lê a config; em falha/ausência, cai num **baseline em código** equivalente (estático + dinâmico) — resiliência, não caminho paralelo.
- O código mantém os builders estáticos como fonte do seed e fallback; o seed espelha tudo no Firestore (editável); "Restaurar padrão" reaplica o baseline.
- As tools permanecem code-wired nesta fase (`buildToolsFactory`); tornar o catálogo de tools data-driven é decisão/fase futura.

## Consequences

- **Positivo:** um único caminho de comportamento; agentes nunca rodam cegos; conteúdo editável de fato; menos código condicional.
- **Negativo / risco:** o seed precisa ser aplicado (reseed `--force`) para a config valer; edições do admin a docs de sistema persistem (não são sobrescritas sem `--force`).
- **Follow-up:** tool-catalog data-driven; introspecção dinâmica de schema; migração do corpus de benchmarking para a KB.
```

Adicione a linha correspondente no índice de `adrs/README.md` (mesmo formato das demais entradas).

- [ ] **Step 2: Commit a documentação**

```bash
git add adrs/decisions/0017-ai-studio-config-canonica.md adrs/README.md
git commit -m "docs(adr): ADR-0017 config canônica do AI Studio (descontinua flags AI_STUDIO_*)"
```

- [ ] **Step 3: Verificação integrada (suite completa + build)**

Run: `pnpm exec vitest run && pnpm exec tsc --noEmit && pnpm build`
Expected: toda a suite verde; build de produção verde.

- [ ] **Step 4: Reseed + smoke (operacional — executar após review final, fora do TDD)**

```bash
pnpm exec tsx --env-file=.env.local scripts/seed-ai-studio.ts --force
# subir o container Docker SEM as flags AI_STUDIO_* e fazer o smoke do chat;
# confirmar na resposta a presença de glossário/schema/filtros (o que antes sumia).
```
*(Este passo é manual/operacional — não há teste automatizado; o reviewer final confirma que `pnpm build` + a suite estão verdes; o reseed/Docker é feito pelo controlador/usuário.)*

---

## Self-Review

**1. Spec coverage:**
- Split estático/dinâmico → Tasks 1, 2 ✅
- 4 skills + seed instruções completas + skillRefs + model tier → Task 3 ✅
- Reseed `--force` (preserva user) → Task 3 ✅
- resolveAgentInstructions sem flag + fallback resiliente → Task 4 ✅
- resolveAgentCapabilities sem flag → Task 4 ✅
- create-mastra compõe static+dynamic + model da config → Task 5 ✅
- 8 adaptadores → Task 5 ✅
- Supervisor orchestrator(config)+workflow+dynamic → Task 6 ✅
- Chat sempre roteia (sem flag) + remoção das flags app-store/env → Task 7 ✅
- ADR-0017 → Task 8 ✅
- Tools code-wired (toolRefs vazias) → Tasks 3, 5 (não-regressão) ✅

**2. Placeholder scan:** Task 2 usa "recipe + exemplo trabalhado" para a extração ×8 — concreto (boundaries verbatim no spec/Explore), não placeholder. Os textos de domínio verbatim estão na auditoria/spec; o implementer tem os arquivos. OK.

**3. Type consistency:** `resolveAgentInstructions(systemKey, codeFallback)` e `resolveAgentCapabilities(systemKey)` (Task 4) consumidos com essa assinatura na Task 5/6 ✅. `buildSupervisorAgent` async (Task 6) aguardado na Task 7 ✅. `MastraAgentFactoryInput` (Task 5) com `buildStatic`/`defaultModelTier` casa com os adaptadores ✅. `ModelTier` de `@/shared/config/agents/types` ✅. `buildAgentDynamicContext`/`buildOrchestratorDynamicContext` (Task 1) consumidos nas Tasks 5/6 ✅.
