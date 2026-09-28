# AI Studio Fase 6 — Tools data-driven Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o conjunto de tools de cada agente selecionável por config — `agent.toolRefs` (Firestore) vira a fonte de verdade, o `TOOL_REGISTRY` cobre todas as ~48 tools reais (inline + tenancy + BQML), e `create-mastra` constrói tools só via registry, com `DEFAULT_AGENT_TOOLS` (código) como fonte do seed e fallback resiliente.

**Architecture:** Espelha o padrão config-canônica/baseline-de-código da Fase 5. `ToolFactory` ganha o `systemKey` (para o `agentId` das tools BQML). `buildToolsFromKeys(keys, ctx, systemKey)` resolve qualquer subconjunto via registry (tenancy→null pulado). `DEFAULT_AGENT_TOOLS[systemKey]` reproduz o set atual de `buildXAgentTools` (fidelidade garantida por teste). O `buildToolsFactory` sai do caminho Mastra; o `buildXAgentTools` legado permanece (usado por `createXAgent`).

**Tech Stack:** Next.js 16, TypeScript, Zod 4, Vitest 4 (`vitest run`, happy-dom, alias `@`→`src`), `@mastra/core` Agent, `ai` SDK (`tool()`), Firestore (firebase-admin), pnpm 10.32.1.

## Global Constraints

- **Spec canônico:** `docs/superpowers/specs/2026-06-18-ai-studio-fase6-tools-data-driven-design.md` — em divergência, a spec vence.
- **Fidelidade (crítica):** para cada um dos 8 agentes, o set data-driven (`buildToolsFromKeys(DEFAULT_AGENT_TOOLS[systemKey], ctx, systemKey)`) deve produzir o **mesmo conjunto de keys** que `Object.keys(buildXAgentTools(ctx))` — com tenancy presente E ausente. Zero regressão de capacidade.
- **Chaves canônicas = nomes LLM-facing:** `dry_run_sql` (não `bq_dry_run_sql`), `list_validated_queries` (não `bq_list_validated_queries`). Atualizar registry + manifesto; a factory por trás é a mesma.
- **Tenancy (ADR-0006):** tools server-bound (`recall_similar_sql`, `list_validated_queries`, `save_validated_query`, `vector_query`) só são construídas com `clientId`(+`personaId`); factory retorna `null` sem isso; `buildToolsFromKeys` pula.
- **BQML `agentId`:** as tools BQML usam `agentId = `${systemKey}_agent`` e `clientId = ctx.dataset` (não `ctx.clientId`). Reproduzir exatamente.
- **Resiliência:** `create-mastra` usa `DEFAULT_AGENT_TOOLS[systemKey]` quando `agent.toolRefs ∪ skill.toolRefs` vier vazio. Agente nunca fica sem tools por falha de config.
- **Skills:** seguem com `toolRefs: []` (tools no agente). `buildXAgentTools` legado + `createXAgent` intocados.
- **Verificação:** cada task roda seus testes; tasks de wiring rodam `pnpm build`. Commits frequentes. Mensagens de commit terminam com `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Inventário-fonte (do audit; o implementer confirma contra cada arquivo):**

| systemKey | tool keys |
|---|---|
| descriptive | dry_run_sql, execute_sql, get_table_schema, get_sample_data, calculate_statistics, build_vintage_curves, build_transition_matrix, read_dashboard_state, read_active_filters, lookup_glossary, recall_similar_sql†, list_validated_queries†, save_validated_query† |
| diagnostic | dry_run_sql, execute_sql, get_table_schema, get_sample_data, calculate_correlations, calculate_hhi, decompose_variation, run_hypothesis_test, list_validated_queries†, save_validated_query† |
| predictive | dry_run_sql, execute_sql, forecast_timeseries, calculate_pd_lgd, build_survival_curve, generate_early_warnings, calculate_cpr_cdr, build_vintage_curves, build_transition_matrix, bqml_list_models, bqml_suggest_model, bqml_create_or_use_model, bqml_forecast, bqml_predict, bqml_detect_anomalies, schema_describe_relationships |
| prescriptive | dry_run_sql, execute_sql, run_clustering, run_causal_analysis, optimize_allocation, rank_actions, evaluate_impact |
| monitoring | dry_run_sql, execute_sql, detect_anomalies, check_eligibility, check_concentration_limits, check_covenant_triggers, generate_compliance_report, bqml_list_models, bqml_forecast, bqml_detect_anomalies |
| simulation | dry_run_sql, execute_sql, get_baseline, run_sensitivity, run_scenario, run_monte_carlo, apply_stress_macro, calculate_stressed_ecl |
| external | dry_run_sql, execute_sql, search_web, get_bcb_indicator, parse_macro_data, sentiment_analysis, extract_regulatory_updates, get_market_benchmarks |
| cashflow | dry_run_sql, execute_sql, calculate_wal, calculate_excess_spread, calculate_coverage_ratios, compare_cashflows, decompose_payments |

† tenancy-conditional. `vector_query` fica no registry/manifesto (atribuível) mas não está em nenhum DEFAULT.

---

### Task 1: `ToolFactory` ganha `systemKey` + reconciliação de chaves

**Files:**
- Modify: `src/features/ai-studio/runtime/tool-registry.ts`
- Modify: `src/features/ai-studio/runtime/tool-registry.test.ts`

**Interfaces:**
- Produces: `type ToolFactory = (ctx: AgentDynamicContext, systemKey: string) => unknown | null`; `buildToolsFromKeys(keys: string[], ctx: AgentDynamicContext, systemKey: string): Record<string, unknown>`. Chaves canônicas: `dry_run_sql`, `list_validated_queries` (substituem `bq_dry_run_sql`, `bq_list_validated_queries` no registry).

- [ ] **Step 1: Update the failing test**

No `tool-registry.test.ts`, ajuste as chamadas de `buildToolsFromKeys` para passar um 3º arg `systemKey` e troque as keys antigas. Adicione um caso para BQML agentId. Substitua o conteúdo por:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/features/ai-agents/tools/execute-sql', () => ({ createExecuteSqlTool: (c: unknown) => ({ tool: 'execute_sql', c }) }));
vi.mock('@/features/ai-agents/tools/bq-dry-run-sql', () => ({ createBqDryRunSqlTool: () => ({ tool: 'dry' }) }));
vi.mock('@/features/ai-agents/tools/get-table-schema-v2', () => ({ createGetTableSchemaV2Tool: () => ({ tool: 'schema' }) }));
vi.mock('@/features/ai-agents/tools/get-sample-data', () => ({ createGetSampleDataTool: () => ({ tool: 'sample' }) }));
vi.mock('@/features/ai-agents/tools/calculate-statistics', () => ({ createCalculateStatisticsTool: () => ({ tool: 'stats' }) }));
vi.mock('@/features/ai-agents/tools/build-vintage-curves', () => ({ createBuildVintageCurvesTool: () => ({ tool: 'vintage' }) }));
vi.mock('@/features/ai-agents/tools/lookup-glossary', () => ({ lookupGlossaryTool: { tool: 'glossary' } }));
vi.mock('@/features/ai-agents/tools/vector-query', () => ({ createVectorQueryTool: (c: { clientId: string }) => ({ tool: 'vector', c }) }));
vi.mock('@/features/ai-agents/tools/recall-similar-sql', () => ({ createRecallSimilarSqlTool: (c: unknown) => ({ tool: 'recall', c }) }));
vi.mock('@/features/ai-agents/tools/bq-list-validated-queries', () => ({ createBqListValidatedQueriesTool: () => ({ tool: 'list' }) }));

import { buildToolsFromKeys } from './tool-registry';

const ctxFull = { dataset: 'om', filters: {}, sessionId: 's', clientId: 'OM', personaId: 'p' } as never;
const ctxNoTenant = { dataset: 'om', filters: {}, sessionId: 's' } as never;

describe('tool-registry (systemKey + canonical keys)', () => {
  it('resolve dry_run_sql (chave canônica) e lookup_glossary', () => {
    const out = buildToolsFromKeys(['dry_run_sql', 'lookup_glossary'], ctxFull, 'descriptive');
    expect(out.dry_run_sql).toBeDefined();
    expect(out.lookup_glossary).toBeDefined();
  });
  it('pula key desconhecida sem lançar', () => {
    const out = buildToolsFromKeys(['execute_sql', 'fantasma'], ctxFull, 'descriptive');
    expect(out.execute_sql).toBeDefined();
    expect(out.fantasma).toBeUndefined();
  });
  it('tenancy: vector_query/recall_similar_sql ausentes sem clientId/persona', () => {
    const no = buildToolsFromKeys(['vector_query', 'recall_similar_sql'], ctxNoTenant, 'descriptive');
    expect(no.vector_query).toBeUndefined();
    expect(no.recall_similar_sql).toBeUndefined();
    const yes = buildToolsFromKeys(['vector_query', 'recall_similar_sql'], ctxFull, 'descriptive');
    expect(yes.vector_query).toBeDefined();
    expect(yes.recall_similar_sql).toBeDefined();
  });
  it('list_validated_queries (chave canônica) sob tenancy', () => {
    expect(buildToolsFromKeys(['list_validated_queries'], ctxFull, 'diagnostic').list_validated_queries).toBeDefined();
    expect(buildToolsFromKeys(['list_validated_queries'], ctxNoTenant, 'diagnostic').list_validated_queries).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/features/ai-studio/runtime/tool-registry.test.ts`
Expected: FAIL — `buildToolsFromKeys` aceita 2 args; `dry_run_sql`/`list_validated_queries` não existem no registry (eram `bq_*`).

- [ ] **Step 3: Update tool-registry.ts (assinatura + chaves canônicas)**

Mude a assinatura do `ToolFactory` e de `buildToolsFromKeys`, e renomeie as 2 keys (a factory `createBqDryRunSqlTool`/`createBqListValidatedQueriesTool` continua a mesma, só a KEY muda). (A expansão completa do registry é a Task 2 — aqui só a assinatura + reconciliação.)

```typescript
export type ToolFactory = (ctx: AgentDynamicContext, systemKey: string) => unknown | null;
```
No objeto `TOOL_REGISTRY`, troque `bq_dry_run_sql:` por `dry_run_sql:` e `bq_list_validated_queries:` por `list_validated_queries:` (mesmas factories). Em `buildToolsFromKeys`, adicione o parâmetro e repasse:

```typescript
export function buildToolsFromKeys(
  keys: string[],
  ctx: AgentDynamicContext,
  systemKey: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const factory = TOOL_REGISTRY[key];
    if (!factory) { console.warn(`[ai-studio] toolRef "${key}" sem factory no registry — pulada`); continue; }
    try {
      const built = factory(ctx, systemKey);
      if (built) out[key] = built;
      else console.warn(`[ai-studio] toolRef "${key}" não construída (tenancy ausente?) — pulada`);
    } catch (e) { console.warn(`[ai-studio] toolRef "${key}" falhou ao construir — pulada`, e); }
  }
  return out;
}
```

- [ ] **Step 4: Fix the existing caller (create-mastra) to compile**

`create-mastra-agent-from-config.ts` chama `buildToolsFromKeys(caps.toolKeys, ctx)` (2 args). Adicione o `systemKey` (já disponível no escopo): `buildToolsFromKeys(caps.toolKeys, ctx, systemKey)`. (Task 5 reescreve esse arquivo; aqui é só manter o build verde.)

- [ ] **Step 5: Run test + type-check**

Run: `pnpm exec vitest run src/features/ai-studio/runtime/tool-registry.test.ts && pnpm exec tsc --noEmit`
Expected: PASS; tsc sem erros novos.

- [ ] **Step 6: Commit**

```bash
git add src/features/ai-studio/runtime/tool-registry.ts src/features/ai-studio/runtime/tool-registry.test.ts src/features/ai-agents/mastra/create-mastra-agent-from-config.ts
git commit -m "refactor(ai-studio): ToolFactory recebe systemKey + chaves canônicas (dry_run_sql/list_validated_queries)"
```

---

### Task 2: Expandir `TOOL_REGISTRY` para todas as ~48 tools (+ relocar inline)

**Files:**
- Modify: `src/features/ai-studio/runtime/tool-registry.ts`
- Modify: `src/features/ai-studio/runtime/tool-registry.test.ts`

**Interfaces:**
- Consumes: `ToolFactory`/`buildToolsFromKeys` (Task 1).
- Produces: `TOOL_REGISTRY` com todas as keys do inventário (Global Constraints) + `vector_query`.

**Nota sobre as tools inline:** `read_dashboard_state`/`read_active_filters` (de `descriptive-agent.ts:40-64`) e `get_baseline` (de `simulation-agent.ts:32-76`) viram factories no registry. Para `get_baseline`, importe os mesmos helpers que `simulation-agent.ts` usa (`getBigQueryClient`, `safeDate`, `buildAndClause`, `validateDataset`, `formatToolError` — confira os imports no topo de `simulation-agent.ts`) e use `toolCtxOf(ctx)` onde o original usa `toolCtx`.

- [ ] **Step 1: Write the failing test**

Adicione ao `tool-registry.test.ts` (mocando mais factories) um caso que verifica cobertura por agente — mas isso é a fidelidade (Task 4). Aqui, um teste mínimo de que keys novas resolvem e que BQML recebe o agentId certo. Adicione:

```typescript
// mocks adicionais no topo do arquivo:
vi.mock('@/features/ai-agents/tools/bqml/forecast', () => ({ createBqmlForecastTool: (c: { agentId: string; clientId: string }) => ({ tool: 'bqml_forecast', c }) }));
vi.mock('@/features/ai-agents/tools/calculate-wal', () => ({ createCalculateWalTool: () => ({ tool: 'wal' }) }));

// novo caso:
it('BQML recebe agentId derivado do systemKey e clientId=ctx.dataset', () => {
  const out = buildToolsFromKeys(['bqml_forecast'], { dataset: 'om', filters: {}, sessionId: 's' } as never, 'monitoring') as Record<string, { c: { agentId: string; clientId: string } }>;
  expect(out.bqml_forecast.c.agentId).toBe('monitoring_agent');
  expect(out.bqml_forecast.c.clientId).toBe('om');
});
it('resolve uma key de cashflow', () => {
  expect(buildToolsFromKeys(['calculate_wal'], { dataset: 'om', filters: {}, sessionId: 's' } as never, 'cashflow').calculate_wal).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/features/ai-studio/runtime/tool-registry.test.ts`
Expected: FAIL — `bqml_forecast`/`calculate_wal` ainda não no registry.

- [ ] **Step 3: Expand the registry**

Adicione os imports de TODAS as factories (paths do audit, relativos a `src/features/ai-studio/runtime/` → use o alias `@/features/ai-agents/tools/...`) e preencha o `TOOL_REGISTRY`. Estrutura (chaves agrupadas por classe de assinatura):

```typescript
// imports — todas as factories (alias @/features/ai-agents/tools/...):
// padrão toolCtx: execute-sql, bq-dry-run-sql, get-table-schema-v2, get-sample-data,
//   calculate-statistics, build-vintage-curves, build-transition-matrix, calculate-correlations,
//   calculate-hhi, decompose-variation, run-hypothesis-test, forecast-timeseries, calculate-pd-lgd,
//   build-survival-curve, generate-early-warnings, calculate-cpr-cdr, run-clustering, run-causal-analysis,
//   optimize-allocation, rank-actions, evaluate-impact, detect-anomalies, check-eligibility,
//   check-concentration-limits, check-covenant-triggers, generate-compliance-report, run-sensitivity,
//   run-scenario, run-monte-carlo, apply-stress-macro, calculate-stressed-ecl, get-market-benchmarks,
//   calculate-wal, calculate-excess-spread, calculate-coverage-ratios, compare-cashflows,
//   decompose-payments, bq-list-validated-queries, bq-save-validated-query
// BQML (assinatura custom): bqml/list-models, bqml/suggest-model, bqml/create-or-use-model,
//   bqml/forecast, bqml/predict, bqml/detect-anomalies
// schema: schema/describe-relationships
// tenancy custom: recall-similar-sql ({clientId,personaId}), vector-query ({clientId})
// direct refs (export, sem call): lookup-glossary, search-web, get-bcb-indicator, parse-macro-data,
//   sentiment-analysis, extract-regulatory-updates
// inline (relocadas): read_dashboard_state, read_active_filters, get_baseline

export const TOOL_REGISTRY: Record<string, ToolFactory> = {
  // —— padrão toolCtx ——
  execute_sql: (ctx) => createExecuteSqlTool(toolCtxOf(ctx)),
  dry_run_sql: (ctx) => createBqDryRunSqlTool(toolCtxOf(ctx)),
  get_table_schema: (ctx) => createGetTableSchemaV2Tool(toolCtxOf(ctx)),
  get_sample_data: (ctx) => createGetSampleDataTool(toolCtxOf(ctx)),
  calculate_statistics: (ctx) => createCalculateStatisticsTool(toolCtxOf(ctx)),
  build_vintage_curves: (ctx) => createBuildVintageCurvesTool(toolCtxOf(ctx)),
  build_transition_matrix: (ctx) => createBuildTransitionMatrixTool(toolCtxOf(ctx)),
  calculate_correlations: (ctx) => createCalculateCorrelationsTool(toolCtxOf(ctx)),
  calculate_hhi: (ctx) => createCalculateHhiTool(toolCtxOf(ctx)),
  decompose_variation: (ctx) => createDecomposeVariationTool(toolCtxOf(ctx)),
  run_hypothesis_test: (ctx) => createRunHypothesisTestTool(toolCtxOf(ctx)),
  forecast_timeseries: (ctx) => createForecastTimeseriesTool(toolCtxOf(ctx)),
  calculate_pd_lgd: (ctx) => createCalculatePdLgdTool(toolCtxOf(ctx)),
  build_survival_curve: (ctx) => createBuildSurvivalCurveTool(toolCtxOf(ctx)),
  generate_early_warnings: (ctx) => createGenerateEarlyWarningsTool(toolCtxOf(ctx)),
  calculate_cpr_cdr: (ctx) => createCalculateCprCdrTool(toolCtxOf(ctx)),
  run_clustering: (ctx) => createRunClusteringTool(toolCtxOf(ctx)),
  run_causal_analysis: (ctx) => createRunCausalAnalysisTool(toolCtxOf(ctx)),
  optimize_allocation: (ctx) => createOptimizeAllocationTool(toolCtxOf(ctx)),
  rank_actions: (ctx) => createRankActionsTool(toolCtxOf(ctx)),
  evaluate_impact: (ctx) => createEvaluateImpactTool(toolCtxOf(ctx)),
  detect_anomalies: (ctx) => createDetectAnomaliesTool(toolCtxOf(ctx)),
  check_eligibility: (ctx) => createCheckEligibilityTool(toolCtxOf(ctx)),
  check_concentration_limits: (ctx) => createCheckConcentrationLimitsTool(toolCtxOf(ctx)),
  check_covenant_triggers: (ctx) => createCheckCovenantTriggersTool(toolCtxOf(ctx)),
  generate_compliance_report: (ctx) => createGenerateComplianceReportTool(toolCtxOf(ctx)),
  run_sensitivity: (ctx) => createRunSensitivityTool(toolCtxOf(ctx)),
  run_scenario: (ctx) => createRunScenarioTool(toolCtxOf(ctx)),
  run_monte_carlo: (ctx) => createRunMonteCarloTool(toolCtxOf(ctx)),
  apply_stress_macro: (ctx) => createApplyStressMacroTool(toolCtxOf(ctx)),
  calculate_stressed_ecl: (ctx) => createCalculateStressedEclTool(toolCtxOf(ctx)),
  get_market_benchmarks: (ctx) => createGetMarketBenchmarksTool(toolCtxOf(ctx)),
  calculate_wal: (ctx) => createCalculateWalTool(toolCtxOf(ctx)),
  calculate_excess_spread: (ctx) => createCalculateExcessSpreadTool(toolCtxOf(ctx)),
  calculate_coverage_ratios: (ctx) => createCalculateCoverageRatiosTool(toolCtxOf(ctx)),
  compare_cashflows: (ctx) => createCompareCashflowsTool(toolCtxOf(ctx)),
  decompose_payments: (ctx) => createDecomposePaymentsTool(toolCtxOf(ctx)),
  // —— BQML (clientId=ctx.dataset, agentId=`${systemKey}_agent`) ——
  bqml_list_models: (ctx) => createBqmlListModelsTool({ clientId: ctx.dataset }),
  bqml_suggest_model: () => createBqmlSuggestModelTool(),
  bqml_create_or_use_model: (ctx, systemKey) => createBqmlCreateOrUseModelTool({ clientId: ctx.dataset, sessionId: ctx.sessionId, agentId: `${systemKey}_agent` }),
  bqml_forecast: (ctx, systemKey) => createBqmlForecastTool({ clientId: ctx.dataset, sessionId: ctx.sessionId, agentId: `${systemKey}_agent` }),
  bqml_predict: (ctx, systemKey) => createBqmlPredictTool({ clientId: ctx.dataset, sessionId: ctx.sessionId, agentId: `${systemKey}_agent` }),
  bqml_detect_anomalies: (ctx, systemKey) => createBqmlDetectAnomaliesTool({ clientId: ctx.dataset, sessionId: ctx.sessionId, agentId: `${systemKey}_agent` }),
  schema_describe_relationships: (ctx) => createDescribeRelationshipsTool({ dataset: ctx.dataset, clientId: ctx.dataset }),
  // —— tenancy custom ——
  recall_similar_sql: (ctx) => (ctx.clientId && ctx.personaId ? createRecallSimilarSqlTool({ clientId: ctx.clientId, personaId: ctx.personaId }) : null),
  list_validated_queries: (ctx) => (ctx.clientId && ctx.personaId ? createBqListValidatedQueriesTool(toolCtxOf(ctx)) : null),
  save_validated_query: (ctx) => (ctx.clientId && ctx.personaId ? createBqSaveValidatedQueryTool(toolCtxOf(ctx)) : null),
  vector_query: (ctx) => (ctx.clientId ? createVectorQueryTool({ clientId: ctx.clientId }) : null),
  // —— direct refs (export, sem call) ——
  lookup_glossary: () => lookupGlossaryTool,
  search_web: () => searchWebTool,
  get_bcb_indicator: () => getBcbIndicatorTool,
  parse_macro_data: () => parseMacroDataTool,
  sentiment_analysis: () => sentimentAnalysisTool,
  extract_regulatory_updates: () => extractRegulatoryUpdatesTool,
  // —— inline relocadas ——
  read_dashboard_state: (ctx) => tool({
    description: 'Retorna o estado atual do dashboard com KPIs visíveis.',
    inputSchema: z.object({}),
    execute: async () => ({ success: true, dashboardState: ctx.dashboardState || null, page: ctx.page }),
  }),
  read_active_filters: (ctx) => tool({
    description: 'Retorna os filtros ativos no dashboard.',
    inputSchema: z.object({}),
    execute: async () => {
      const activeAdvanced: Record<string, string[]> = {};
      for (const [key, values] of Object.entries(ctx.filters.advancedFilters)) {
        if (Array.isArray(values) && values.length > 0) activeAdvanced[key] = values;
      }
      return { success: true, filters: { dateRange: ctx.filters.dateRange, projetos: ctx.filters.projetos, compareEnabled: ctx.filters.compareEnabled, comparePeriod: ctx.filters.comparePeriod ?? null, advancedFilters: activeAdvanced } };
    },
  }),
  get_baseline: (ctx) => tool({
    // corpo VERBATIM de simulation-agent.ts:32-76 (usa toolCtxOf(ctx) no lugar de `toolCtx`)
    // — copiar a definição completa do arquivo-fonte; importa getBigQueryClient/safeDate/
    //   buildAndClause/validateDataset/formatToolError dos mesmos paths de simulation-agent.ts
    description: 'Retorna os valores atuais (baseline) da carteira para comparação com cenários simulados.',
    inputSchema: z.object({ metrics: z.array(z.string()).optional().describe('Métricas específicas. Se vazio, retorna todas.') }),
    execute: async ({ metrics }: { metrics?: string[] }) => {
      /* … corpo verbatim de simulation-agent.ts get_baseline, com toolCtxOf(ctx) … */
      return { success: true } as never;
    },
  }),
};
```

**IMPORTANTE:** o corpo de `get_baseline` acima é um esqueleto — copie o corpo VERBATIM de `simulation-agent.ts:32-76` (a query SQL completa, o tratamento de `metrics`, o try/catch), trocando `toolCtx` por `toolCtxOf(ctx)`. Adicione `import { tool } from 'ai'` e `import { z } from 'zod'`.

- [ ] **Step 4: Run test + type-check**

Run: `pnpm exec vitest run src/features/ai-studio/runtime/tool-registry.test.ts && pnpm exec tsc --noEmit`
Expected: PASS; tsc sem erros (todos os imports resolvem).

- [ ] **Step 5: Commit**

```bash
git add src/features/ai-studio/runtime/tool-registry.ts src/features/ai-studio/runtime/tool-registry.test.ts
git commit -m "feat(ai-studio): TOOL_REGISTRY cobre todas as ~48 tools (inline relocadas + BQML por systemKey)"
```

---

### Task 3: Expandir `tools-manifest.ts` (todas as keys, canônicas)

**Files:**
- Modify: `src/features/ai-studio/tools-manifest.ts`
- Test: `src/features/ai-studio/tools-manifest.test.ts` (CREATE)

**Interfaces:**
- Produces: `TOOL_MANIFEST` com uma entrada por key do registry; `ToolCategory` estendido. Invariante: keys do manifesto === keys do `TOOL_REGISTRY`.

- [ ] **Step 1: Write the failing test (coverage manifesto ↔ registry)**

```typescript
// src/features/ai-studio/tools-manifest.test.ts
import { describe, it, expect } from 'vitest';
import { TOOL_MANIFEST } from './tools-manifest';
import { TOOL_REGISTRY } from '@/features/ai-studio/runtime/tool-registry';

describe('tools-manifest ↔ registry', () => {
  it('toda key do manifesto tem factory no registry', () => {
    for (const t of TOOL_MANIFEST) expect(TOOL_REGISTRY[t.key], `manifest key sem factory: ${t.key}`).toBeDefined();
  });
  it('toda key do registry está no manifesto', () => {
    const manifestKeys = new Set(TOOL_MANIFEST.map((t) => t.key));
    for (const k of Object.keys(TOOL_REGISTRY)) expect(manifestKeys.has(k), `registry key fora do manifesto: ${k}`).toBe(true);
  });
  it('chaves canônicas presentes; antigas ausentes', () => {
    const keys = new Set(TOOL_MANIFEST.map((t) => t.key));
    expect(keys.has('dry_run_sql')).toBe(true);
    expect(keys.has('list_validated_queries')).toBe(true);
    expect(keys.has('bq_dry_run_sql')).toBe(false);
    expect(keys.has('bq_list_validated_queries')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/features/ai-studio/tools-manifest.test.ts`
Expected: FAIL — manifesto tem só 19 keys; várias do registry ausentes; `bq_*` presentes.

- [ ] **Step 3: Rewrite the manifest**

Estenda `ToolCategory` e liste TODAS as keys do registry. Categorias sugeridas (a UI agrupa por isto):

```typescript
export type ToolCategory =
  | 'data' | 'stats' | 'bqml' | 'risk' | 'simulation' | 'cashflow' | 'memory' | 'rag' | 'external' | 'export';

export const TOOL_MANIFEST: ToolDescriptor[] = [
  // data
  { key: 'execute_sql', name: 'Executar SQL', description: 'Roda uma query no BigQuery do cliente.', category: 'data' },
  { key: 'dry_run_sql', name: 'Validar SQL (dry-run)', description: 'Valida SQL sem executar.', category: 'data' },
  { key: 'get_table_schema', name: 'Schema da tabela', description: 'Introspecção de schema.', category: 'data' },
  { key: 'get_sample_data', name: 'Amostra de dados', description: 'Retorna linhas de amostra.', category: 'data' },
  { key: 'read_dashboard_state', name: 'Estado do dashboard', description: 'KPIs visíveis na tela.', category: 'data' },
  { key: 'read_active_filters', name: 'Filtros ativos', description: 'Filtros aplicados no dashboard.', category: 'data' },
  { key: 'schema_describe_relationships', name: 'Relações de schema', description: 'Descreve relações entre tabelas.', category: 'data' },
  // stats / analytics
  { key: 'calculate_statistics', name: 'Estatísticas', description: 'Agregações estatísticas.', category: 'stats' },
  { key: 'build_vintage_curves', name: 'Curvas de safra', description: 'Curvas de vintage de crédito.', category: 'stats' },
  { key: 'build_transition_matrix', name: 'Matriz de transição', description: 'Migração de rating entre períodos.', category: 'stats' },
  { key: 'calculate_correlations', name: 'Correlações', description: 'Correlações entre variáveis.', category: 'stats' },
  { key: 'calculate_hhi', name: 'HHI', description: 'Índice de concentração Herfindahl-Hirschman.', category: 'stats' },
  { key: 'decompose_variation', name: 'Decompor variação', description: 'Decomposição de variação por dimensão.', category: 'stats' },
  { key: 'run_hypothesis_test', name: 'Teste de hipótese', description: 'Teste estatístico de hipótese.', category: 'stats' },
  { key: 'forecast_timeseries', name: 'Forecast (séries)', description: 'Projeção de série temporal (ARIMA/fallback).', category: 'stats' },
  { key: 'calculate_pd_lgd', name: 'PD/LGD', description: 'Probabilidade de default e perda dado default.', category: 'stats' },
  { key: 'build_survival_curve', name: 'Curva de sobrevivência', description: 'Curva de sobrevivência de contratos.', category: 'stats' },
  { key: 'generate_early_warnings', name: 'Alertas precoces', description: 'Sinais de deterioração.', category: 'stats' },
  { key: 'calculate_cpr_cdr', name: 'CPR/CDR', description: 'Taxas de pré-pagamento e default.', category: 'stats' },
  // bqml
  { key: 'bqml_list_models', name: 'BQML — listar modelos', description: 'Lista modelos BigQuery ML.', category: 'bqml' },
  { key: 'bqml_suggest_model', name: 'BQML — sugerir modelo', description: 'Sugere tipo de modelo BQML.', category: 'bqml' },
  { key: 'bqml_create_or_use_model', name: 'BQML — criar/usar', description: 'Cria ou reusa modelo BQML.', category: 'bqml' },
  { key: 'bqml_forecast', name: 'BQML Forecast', description: 'Previsão via BigQuery ML.', category: 'bqml' },
  { key: 'bqml_predict', name: 'BQML Predict', description: 'Predição via BigQuery ML.', category: 'bqml' },
  { key: 'bqml_detect_anomalies', name: 'BQML Anomalias', description: 'Detecção de anomalias.', category: 'bqml' },
  // prescriptive (risk)
  { key: 'run_clustering', name: 'Clustering', description: 'Agrupa contratos (K-Means).', category: 'risk' },
  { key: 'run_causal_analysis', name: 'Análise causal', description: 'Avaliação de impacto causal.', category: 'risk' },
  { key: 'optimize_allocation', name: 'Otimizar alocação', description: 'Otimização de alocação.', category: 'risk' },
  { key: 'rank_actions', name: 'Priorizar ações', description: 'Ranking multicritério de ações.', category: 'risk' },
  { key: 'evaluate_impact', name: 'Avaliar impacto', description: 'Avaliação de impacto de ações.', category: 'risk' },
  // monitoring (risk)
  { key: 'detect_anomalies', name: 'Detectar anomalias', description: 'Detecção de anomalias nos dados.', category: 'risk' },
  { key: 'check_eligibility', name: 'Checar elegibilidade', description: 'Elegibilidade CRI.', category: 'risk' },
  { key: 'check_concentration_limits', name: 'Limites de concentração', description: 'Limites CVM 60.', category: 'risk' },
  { key: 'check_covenant_triggers', name: 'Covenants', description: 'Gatilhos de covenants.', category: 'risk' },
  { key: 'generate_compliance_report', name: 'Relatório de compliance', description: 'Relatório de compliance.', category: 'risk' },
  // simulation
  { key: 'get_baseline', name: 'Baseline', description: 'Valores atuais da carteira p/ comparação.', category: 'simulation' },
  { key: 'run_sensitivity', name: 'Sensibilidade', description: 'Análise de sensibilidade OAT.', category: 'simulation' },
  { key: 'run_scenario', name: 'Cenário', description: 'Cenário determinístico.', category: 'simulation' },
  { key: 'run_monte_carlo', name: 'Monte Carlo', description: 'Simulação de Monte Carlo.', category: 'simulation' },
  { key: 'apply_stress_macro', name: 'Stress macro', description: 'Aplica choque macroeconômico.', category: 'simulation' },
  { key: 'calculate_stressed_ecl', name: 'ECL estressado', description: 'ECL sob cenário de stress.', category: 'simulation' },
  // cashflow
  { key: 'calculate_wal', name: 'WAL', description: 'Weighted Average Life.', category: 'cashflow' },
  { key: 'calculate_excess_spread', name: 'Excess spread', description: 'Excedente estrutural.', category: 'cashflow' },
  { key: 'calculate_coverage_ratios', name: 'Coverage ratios', description: 'OC/IC ratios.', category: 'cashflow' },
  { key: 'compare_cashflows', name: 'Comparar fluxos', description: 'Esperado vs contratado.', category: 'cashflow' },
  { key: 'decompose_payments', name: 'Decompor pagamentos', description: 'Pagamentos por tipo.', category: 'cashflow' },
  // memory
  { key: 'lookup_glossary', name: 'Glossário', description: 'Consulta termos do glossário.', category: 'memory' },
  { key: 'recall_similar_sql', name: 'Recall de SQL', description: 'Busca semântica de SQL similar (ADR-0011).', category: 'memory' },
  { key: 'list_validated_queries', name: 'Catálogo de SQL', description: 'Lista queries curadas (ADR-0009).', category: 'memory' },
  { key: 'save_validated_query', name: 'Salvar SQL', description: 'Sugere SQL ao catálogo (gate humano).', category: 'memory' },
  // rag
  { key: 'vector_query', name: 'Busca RAG', description: 'Recupera documentos por similaridade.', category: 'rag' },
  // external
  { key: 'search_web', name: 'Busca web', description: 'Busca dados externos.', category: 'external' },
  { key: 'get_bcb_indicator', name: 'Indicador BCB', description: 'Indicadores do Banco Central.', category: 'external' },
  { key: 'parse_macro_data', name: 'Parse macro', description: 'Estrutura dados macro.', category: 'external' },
  { key: 'sentiment_analysis', name: 'Sentimento', description: 'Análise de sentimento.', category: 'external' },
  { key: 'extract_regulatory_updates', name: 'Atualizações regulatórias', description: 'Extrai novidades regulatórias.', category: 'external' },
  { key: 'get_market_benchmarks', name: 'Benchmarks de mercado', description: 'Benchmarks de CRI/mercado.', category: 'external' },
];
```

Mantenha `hasTool`/`listTools`. **Remova** as entradas órfãs antigas que não têm factory (`update_working_memory`, `retrieve_business_context`, `generate_pdf`, `generate_csv`) — não são usadas por nenhum agente nem têm factory no registry; ficam como follow-up se quisermos torná-las atribuíveis.

- [ ] **Step 4: Run test + type-check**

Run: `pnpm exec vitest run src/features/ai-studio/tools-manifest.test.ts && pnpm exec tsc --noEmit`
Expected: PASS (manifesto == registry); tsc verde.

- [ ] **Step 5: Commit**

```bash
git add src/features/ai-studio/tools-manifest.ts src/features/ai-studio/tools-manifest.test.ts
git commit -m "feat(ai-studio): manifesto cobre todas as tools do registry (chaves canônicas + categorias)"
```

---

### Task 4: `DEFAULT_AGENT_TOOLS` + seed `toolRefs` + teste de fidelidade

**Files:**
- Create: `src/shared/config/agents/default-agent-tools.ts`
- Modify: `src/features/ai-studio/seed/manifest.ts`
- Test: `src/features/ai-agents/mastra/tools-fidelity.test.ts` (CREATE)
- Modify: `src/features/ai-studio/seed/manifest.test.ts`

**Interfaces:**
- Produces: `DEFAULT_AGENT_TOOLS: Record<string, string[]>`. Seed: `agent.toolRefs = DEFAULT_AGENT_TOOLS[id]`.

- [ ] **Step 1: Write the failing fidelity test (crítico)**

```typescript
// src/features/ai-agents/mastra/tools-fidelity.test.ts
import { describe, it, expect } from 'vitest';
import { DEFAULT_AGENT_TOOLS } from '@/shared/config/agents/default-agent-tools';
import { buildToolsFromKeys } from '@/features/ai-studio/runtime/tool-registry';
import { buildDescriptiveAgentTools } from '@/features/ai-agents/agents/descriptive-agent';
import { buildDiagnosticAgentTools } from '@/features/ai-agents/agents/diagnostic-agent';
import { buildPredictiveAgentTools } from '@/features/ai-agents/agents/predictive-agent';
import { buildPrescriptiveAgentTools } from '@/features/ai-agents/agents/prescriptive-agent';
import { buildMonitoringAgentTools } from '@/features/ai-agents/agents/monitoring-agent';
import { buildSimulationAgentTools } from '@/features/ai-agents/agents/simulation-agent';
import { buildExternalAgentTools } from '@/features/ai-agents/agents/external-agent';
import { buildCashflowAgentTools } from '@/features/ai-agents/agents/cashflow-agent';

const FACTORIES: Record<string, (ctx: never) => Record<string, unknown>> = {
  descriptive: buildDescriptiveAgentTools, diagnostic: buildDiagnosticAgentTools,
  predictive: buildPredictiveAgentTools, prescriptive: buildPrescriptiveAgentTools,
  monitoring: buildMonitoringAgentTools, simulation: buildSimulationAgentTools,
  external: buildExternalAgentTools, cashflow: buildCashflowAgentTools,
};
function ctx(tenancy: boolean) {
  return {
    dataset: 'om',
    filters: { dateRange: { start: '2025-01-01', end: '2025-12-31' }, projetos: [], advancedFilters: {}, compareEnabled: false },
    dashboardState: '', page: '/', sessionId: 's',
    ...(tenancy ? { clientId: 'OM', personaId: 'cfo' } : {}),
  } as never;
}

describe('fidelidade tools data-driven vs buildXAgentTools', () => {
  for (const [key, factory] of Object.entries(FACTORIES)) {
    for (const tenancy of [true, false]) {
      it(`${key} (tenancy=${tenancy}) — mesmas keys`, () => {
        const c = ctx(tenancy);
        const legacy = Object.keys(factory(c)).sort();
        const dataDriven = Object.keys(buildToolsFromKeys(DEFAULT_AGENT_TOOLS[key], c, key)).sort();
        expect(dataDriven).toEqual(legacy);
      });
    }
  }
});
```

*(Este teste pode tocar factories reais; se alguma exigir BQ/Vertex no construtor e quebrar, mocke os módulos pesados no topo como em `descriptive-agent.test.ts` — `@/shared/lib/bigquery/client` e `@ai-sdk/google-vertex`. O importante é comparar as KEYS, não executar as tools.)*

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/features/ai-agents/mastra/tools-fidelity.test.ts`
Expected: FAIL — `default-agent-tools` não existe.

- [ ] **Step 3: Create default-agent-tools.ts**

```typescript
/** Tool keys por agente (fonte do seed + fallback do create-mastra). Espelha buildXAgentTools. */
export const DEFAULT_AGENT_TOOLS: Record<string, string[]> = {
  descriptive: ['dry_run_sql', 'execute_sql', 'get_table_schema', 'get_sample_data', 'calculate_statistics', 'build_vintage_curves', 'build_transition_matrix', 'read_dashboard_state', 'read_active_filters', 'lookup_glossary', 'recall_similar_sql', 'list_validated_queries', 'save_validated_query'],
  diagnostic: ['dry_run_sql', 'execute_sql', 'get_table_schema', 'get_sample_data', 'calculate_correlations', 'calculate_hhi', 'decompose_variation', 'run_hypothesis_test', 'list_validated_queries', 'save_validated_query'],
  predictive: ['dry_run_sql', 'execute_sql', 'forecast_timeseries', 'calculate_pd_lgd', 'build_survival_curve', 'generate_early_warnings', 'calculate_cpr_cdr', 'build_vintage_curves', 'build_transition_matrix', 'bqml_list_models', 'bqml_suggest_model', 'bqml_create_or_use_model', 'bqml_forecast', 'bqml_predict', 'bqml_detect_anomalies', 'schema_describe_relationships'],
  prescriptive: ['dry_run_sql', 'execute_sql', 'run_clustering', 'run_causal_analysis', 'optimize_allocation', 'rank_actions', 'evaluate_impact'],
  monitoring: ['dry_run_sql', 'execute_sql', 'detect_anomalies', 'check_eligibility', 'check_concentration_limits', 'check_covenant_triggers', 'generate_compliance_report', 'bqml_list_models', 'bqml_forecast', 'bqml_detect_anomalies'],
  simulation: ['dry_run_sql', 'execute_sql', 'get_baseline', 'run_sensitivity', 'run_scenario', 'run_monte_carlo', 'apply_stress_macro', 'calculate_stressed_ecl'],
  external: ['dry_run_sql', 'execute_sql', 'search_web', 'get_bcb_indicator', 'parse_macro_data', 'sentiment_analysis', 'extract_regulatory_updates', 'get_market_benchmarks'],
  cashflow: ['dry_run_sql', 'execute_sql', 'calculate_wal', 'calculate_excess_spread', 'calculate_coverage_ratios', 'compare_cashflows', 'decompose_payments'],
};
```

**Confira contra cada `buildXAgentTools` antes de finalizar** (o teste de fidelidade é o juiz; se falhar, a lista aqui ou alguma entrada do registry diverge — corrija).

- [ ] **Step 4: Seed toolRefs from DEFAULT_AGENT_TOOLS**

Em `seed/manifest.ts`, importe `DEFAULT_AGENT_TOOLS` e troque `toolRefs: []` por `toolRefs: DEFAULT_AGENT_TOOLS[id] ?? []` na helper `agent(...)`. Atualize o teste `manifest.test.ts`: a asserção "toolRefs vazias" vira "toolRefs = DEFAULT_AGENT_TOOLS[id]" para os 8 sub-agentes (orchestrator segue `[]`).

```typescript
// manifest.test.ts — substituir o it de toolRefs:
it('sub-agentes têm toolRefs = DEFAULT_AGENT_TOOLS; orchestrator vazio; skills vazias', () => {
  for (const a of SYSTEM_SEEDS.filter((s) => s.type === 'agent')) {
    if (a.id === 'orchestrator') { expect(a.doc.toolRefs).toEqual([]); continue; }
    expect((a.doc.toolRefs as string[]).length).toBeGreaterThan(0);
  }
  for (const s of SYSTEM_SEEDS.filter((s) => s.type === 'skill')) expect(s.doc.toolRefs).toEqual([]);
});
```

- [ ] **Step 5: Run tests + type-check**

Run: `pnpm exec vitest run src/features/ai-agents/mastra/tools-fidelity.test.ts src/features/ai-studio/seed/ && pnpm exec tsc --noEmit`
Expected: PASS (16 casos de fidelidade — 8 agentes × 2 tenancy — todos verdes); seed ok.

- [ ] **Step 6: Commit**

```bash
git add src/shared/config/agents/default-agent-tools.ts src/features/ai-studio/seed/manifest.ts src/features/ai-agents/mastra/tools-fidelity.test.ts src/features/ai-studio/seed/manifest.test.ts
git commit -m "feat(ai-studio): DEFAULT_AGENT_TOOLS + seed toolRefs + teste de fidelidade por agente"
```

---

### Task 5: `create-mastra` larga `buildToolsFactory` (registry + fallback DEFAULT)

**Files:**
- Modify: `src/features/ai-agents/mastra/create-mastra-agent-from-config.ts`
- Modify: `src/features/ai-agents/mastra/{descriptive,diagnostic,predictive,prescriptive,monitoring,simulation,external,cashflow}-agent-mastra.ts`
- Modify: `src/features/ai-agents/mastra/create-mastra-agent-from-config.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_AGENT_TOOLS` (Task 4), `buildToolsFromKeys(keys, ctx, systemKey)` (Task 1), `resolveAgentCapabilities` (Fase 5).
- Produces: input do helper SEM `buildToolsFactory`.

- [ ] **Step 1: Update the failing test**

No `create-mastra-agent-from-config.test.ts`, remova `buildToolsFactory` do `input(...)`; mocke `DEFAULT_AGENT_TOOLS` e ajuste os asserts de tools (agora vêm de `buildToolsFromKeys`). Adicione:

```typescript
vi.mock('@/shared/config/agents/default-agent-tools', () => ({ DEFAULT_AGENT_TOOLS: { diagnostic: ['execute_sql'] } }));
// h.buildFromKeysMock já existe; configure-o p/ refletir a key default.

it('config vazia → usa DEFAULT_AGENT_TOOLS[systemKey]', async () => {
  h.resolveCapsMock.mockResolvedValue({ toolKeys: [], kbRefs: [] });
  h.buildFromKeysMock.mockReturnValue({ execute_sql: 'BASE' });
  await createMastraAgentFromConfig(input());
  // buildToolsFromKeys chamado com a lista DEFAULT (['execute_sql']) e systemKey
  expect(h.buildFromKeysMock).toHaveBeenCalledWith(['execute_sql'], ctx, 'diagnostic');
});
it('config com toolRefs → usa caps.toolKeys', async () => {
  h.resolveCapsMock.mockResolvedValue({ toolKeys: ['calculate_hhi'], kbRefs: [] });
  await createMastraAgentFromConfig(input());
  expect(h.buildFromKeysMock).toHaveBeenCalledWith(['calculate_hhi'], ctx, 'diagnostic');
});
```

(Remova os asserts antigos que dependiam de `buildToolsFactory`/base tools.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/features/ai-agents/mastra/create-mastra-agent-from-config.test.ts`
Expected: FAIL — input ainda exige `buildToolsFactory`; tools vêm da base.

- [ ] **Step 3: Rewrite create-mastra-agent-from-config.ts**

Remova `buildToolsFactory` do input e a chamada base; construa tools só via registry com fallback:

```typescript
import { DEFAULT_AGENT_TOOLS } from '@/shared/config/agents/default-agent-tools';
// ... (mantém os demais imports; remove nada do resto da Fase 5)

export interface MastraAgentFactoryInput {
  systemKey: string;
  name: string;
  description: string;
  defaultModelTier: ModelTier;
  buildStatic: () => string;
  ctx: AgentDynamicContext;
  // buildToolsFactory removido
}

export async function createMastraAgentFromConfig(input: MastraAgentFactoryInput): Promise<Agent> {
  const { systemKey, name, description, defaultModelTier, buildStatic, ctx } = input;
  const cfg = await loadAgentConfig(systemKey).catch(() => null);
  const tier = (() => {
    const VALID_TIERS: readonly ModelTier[] = ['router', 'fast', 'flash', 'reasoning'];
    const t = cfg?.model as string | undefined;
    return VALID_TIERS.includes(t as ModelTier) ? (t as ModelTier) : defaultModelTier;
  })();

  const instructions = [
    await resolveAgentInstructions(systemKey, composeCodeBaseline(buildStatic)),
    buildAgentDynamicContext(ctx),
  ].join('\n\n');

  const caps = await resolveAgentCapabilities(systemKey);
  const toolKeys = caps.toolKeys.length > 0 ? caps.toolKeys : (DEFAULT_AGENT_TOOLS[systemKey] ?? []);
  const tools = buildToolsFromKeys(toolKeys, ctx, systemKey);

  const kbRefs = Array.from(new Set([...((cfg?.knowledgeBaseRefs as string[] | undefined) ?? []), ...caps.kbRefs]));
  if (kbRefs.length > 0) {
    try { tools.kb_retrieval = createKbRetrievalTool({ clientId: (ctx as { clientId?: string }).clientId, knowledgeBaseRefs: kbRefs }); } catch { /* fail-soft */ }
  }

  return new Agent({ id: `${systemKey}_agent`, name, description, instructions, model: getModel(tier) as never, tools: tools as never });
}
```

(O `composeCodeBaseline` e os demais helpers da Fase 5 ficam inalterados.)

- [ ] **Step 4: Update the 8 adapters (remover buildToolsFactory)**

Em cada `*-agent-mastra.ts`, remova a linha `buildToolsFactory: buildXAgentTools,` e o import de `buildXAgentTools`. Ex. (descriptive):

```typescript
import type { Agent } from '@mastra/core/agent';
import { buildDescriptiveStatic } from '@/shared/config/agents';
import type { AgentDynamicContext } from '@/shared/config/agents/types';
import { createMastraAgentFromConfig } from './create-mastra-agent-from-config';

export async function createDescriptiveAgentMastra(input: { ctx: AgentDynamicContext }): Promise<Agent> {
  return createMastraAgentFromConfig({
    systemKey: 'descriptive',
    name: 'Descriptive Agent',
    description: 'Analisa dados da carteira: resumos, KPIs, estatísticas descritivas, curvas vintage, matrizes de transição e consultas SQL.',
    defaultModelTier: 'fast',
    buildStatic: buildDescriptiveStatic,
    ctx: input.ctx,
  });
}
```

Aplique aos outros 7 (mantendo name/description/defaultModelTier de cada — `reasoning` p/ diagnostic/predictive/prescriptive/monitoring/simulation; `fast` p/ external/cashflow). Os `buildXAgentTools` legados continuam exportados em `agents/*-agent.ts` (usados pelo `createXAgent` legado) — não os remova.

- [ ] **Step 5: Run tests + type-check + build**

Run: `pnpm exec vitest run src/features/ai-agents/mastra/ && pnpm exec tsc --noEmit && pnpm build`
Expected: PASS; build VERDE.

- [ ] **Step 6: Commit**

```bash
git add src/features/ai-agents/mastra/
git commit -m "refactor(ai-studio): create-mastra constrói tools via registry + fallback DEFAULT (sem buildToolsFactory)"
```

---

### Task 6: Verificação integrada + UI + reseed (operacional)

**Files:**
- Verify: `src/features/ai-studio/admin/ui/AiAgentsTab.tsx` (o `MultiRefSelect` de `toolRefs` já existe — confirmar que renderiza o manifesto expandido)
- No code change unless a gap is found.

- [ ] **Step 1: Confirmar a UI de toolRefs**

Leia `AiAgentsTab.tsx`: confirme que o `<MultiRefSelect label="Tools" options={tools} value={draft.toolRefs} ... />` existe e que `tools` vem de `fetchTools()` (→ `/api/ai-studio/tools` → manifesto). Com o manifesto expandido (Task 3), o multi-select passa a listar todas as ~48 tools. Se o componente NÃO estiver wired (divergência do audit), adicione-o espelhando `skillRefs` e reporte como DONE_WITH_CONCERNS.

- [ ] **Step 2: Suíte completa + build (gate)**

Run: `pnpm exec vitest run && pnpm build`
Expected: suíte 100% verde (inclui fidelidade 16/16 + manifesto↔registry); build VERDE. Reporte os totais.

- [ ] **Step 3: tsc**

Run: `pnpm exec tsc --noEmit`
Expected: só os ~4 erros TS2698 pré-existentes em test files; zero novos.

- [ ] **Step 4: Commit (se houve ajuste de UI) ou nota**

Se a UI precisou de ajuste, commit `feat(ai-studio): toolRefs multi-select no editor de agente`. Senão, sem commit (a UI já estava pronta) — registre no report.

- [ ] **Step 5: Reseed (operacional — pós-review, controlador/usuário)**

```bash
pnpm exec tsx --env-file=.env.local scripts/seed-ai-studio.ts --force
```
Popula `agent.toolRefs` nos docs `origin:'system'` (preserva `origin:'user'`). Depois, rebuild/restart do container Docker e smoke do chat exercitando ao menos um tool por categoria. *(Manual; o reviewer final confirma suíte+build verdes; o reseed/Docker é feito pelo controlador.)*

---

## Self-Review

**1. Spec coverage:**
- Registry cobre todas as tools (inline + tenancy + BQML) → Tasks 1, 2 ✅
- Chaves canônicas → Tasks 1, 3 ✅
- Manifesto = registry → Task 3 ✅
- `agent.toolRefs` canônico + seed + fidelidade → Task 4 ✅
- `create-mastra` sem `buildToolsFactory` + fallback DEFAULT + 8 adapters → Task 5 ✅
- UI multi-select → Task 6 (já wired; só verificar) ✅
- Tenancy preservada → Tasks 1, 2, 4 (teste com/sem tenancy) ✅
- `buildXAgentTools`/legado intocados → Tasks 5 (não remove) ✅

**2. Placeholder scan:** O corpo de `get_baseline` em Task 2 é o único ponto "copie verbatim do arquivo-fonte" — é deliberado (texto grande já existente no repo; o implementer tem o arquivo) e delimitado, não um TODO. O `DEFAULT_AGENT_TOOLS` (Task 4) é a lista completa; o teste de fidelidade é o juiz.

**3. Type consistency:** `ToolFactory(ctx, systemKey)` (T1) usado por `buildToolsFromKeys(keys, ctx, systemKey)` (T1) e por `create-mastra` (T5) ✅. `DEFAULT_AGENT_TOOLS: Record<string,string[]>` (T4) consumido em T4 (seed) e T5 (fallback) ✅. `MastraAgentFactoryInput` sem `buildToolsFactory` (T5) casa com os 8 adapters (T5) ✅. Chaves canônicas (`dry_run_sql`/`list_validated_queries`) consistentes entre registry (T1/T2), manifesto (T3) e DEFAULT (T4) ✅.
