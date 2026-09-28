# AI System Architectural Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 5 systemic architectural issues in the multi-agent AI system: filter propagation, BQML data leakage, model naming collisions, LGD formula inconsistency, and model cleanup.

**Architecture:** Introduce a shared `ToolContext` type that carries `dataset` + `filters` to all tool factories. Create utility functions for building WHERE clauses and BQML model names with session scoping. Unify LGD computation in a shared module.

**Tech Stack:** TypeScript, Zod, BigQuery SQL, BQML

---

## File Map

| File | Responsibility | Action |
|------|---------------|--------|
| `src/features/ai-agents/tools/tool-context.ts` | Shared ToolContext type + SQL filter builder | **Create** |
| `src/features/ai-agents/tools/lgd-utils.ts` | Unified LGD computation SQL fragments | **Create** |
| `src/features/ai-agents/tools/bqml-utils.ts` | Add session-scoped model naming + cleanup | **Modify** |
| `src/features/ai-agents/agents/*.ts` (8 files) | Pass ToolContext instead of bare dataset | **Modify** |
| 30+ tool files in `src/features/ai-agents/tools/` | Accept ToolContext, inject filters into SQL | **Modify** |
| `src/features/ai-agents/orchestrator.ts` | Build ToolContext from request | **Modify** |
| `src/features/canvas-orchestrator/orchestrator.ts` | Build ToolContext from request | **Modify** |

---

### Task 1: Create ToolContext type and SQL filter builder

**Files:**
- Create: `src/features/ai-agents/tools/tool-context.ts`

This is the foundation. All tools will use this instead of bare `dataset: string`.

- [ ] **Step 1: Create tool-context.ts**

```typescript
// src/features/ai-agents/tools/tool-context.ts
import type { ChatRequestFilters } from '@/shared/config/agents/types';

/**
 * Shared context passed to all tool factories.
 * Replaces the bare `dataset: string` parameter.
 */
export interface ToolContext {
  dataset: string;
  filters: ChatRequestFilters;
  /** Unique session ID for BQML model scoping. Generated per API request. */
  sessionId: string;
}

/**
 * Builds a WHERE clause fragment for the `contratos` table based on active filters.
 * Returns empty string if no filters are active beyond the required ones.
 * Does NOT include the WHERE keyword — caller must prepend it.
 *
 * @param ctx - Tool context with active filters
 * @param opts.dateColumn - Column name for date filter (default: 'data_base_report')
 * @param opts.dateMode - 'snapshot' uses = end date, 'range' uses BETWEEN, 'none' skips date filter
 * @param opts.tableAlias - Optional table alias prefix (e.g., 'c' for 'c.data_base_report')
 */
export function buildFilterClause(
  ctx: ToolContext,
  opts: {
    dateColumn?: string;
    dateMode?: 'snapshot' | 'range' | 'none';
    tableAlias?: string;
  } = {},
): string {
  const { dateColumn = 'data_base_report', dateMode = 'snapshot', tableAlias } = opts;
  const prefix = tableAlias ? `${tableAlias}.` : '';
  const clauses: string[] = [];

  // Date filter
  if (dateMode === 'snapshot') {
    clauses.push(`${prefix}${dateColumn} = '${ctx.filters.dateRange.end}'`);
  } else if (dateMode === 'range') {
    clauses.push(`${prefix}${dateColumn} BETWEEN '${ctx.filters.dateRange.start}' AND '${ctx.filters.dateRange.end}'`);
  }

  // Projeto filter
  if (ctx.filters.projetos.length > 0) {
    const escaped = ctx.filters.projetos.map(p => `'${p.replace(/'/g, "''")}'`).join(', ');
    clauses.push(`${prefix}projeto IN (${escaped})`);
  }

  // Advanced filters
  const af = ctx.filters.advancedFilters;
  if (af.ratings?.length) {
    clauses.push(`${prefix}rating_liquid IN (${af.ratings.map(r => `'${r}'`).join(', ')})`);
  }
  if (af.elegibilidade?.length) {
    const normalized = af.elegibilidade.map(e =>
      e === 'Elegível' ? 'Elegivel' : e === 'Não Elegível' ? 'Nao Elegivel' : e,
    );
    clauses.push(`${prefix}elegibilidade IN (${normalized.map(e => `'${e}'`).join(', ')})`);
  }
  if (af.faixaLtv?.length) {
    clauses.push(`${prefix}faixa_ltv IN (${af.faixaLtv.map(f => `'${f}'`).join(', ')})`);
  }
  if (af.faixaAtraso?.length) {
    clauses.push(`${prefix}faixa_atraso IN (${af.faixaAtraso.map(f => `'${f}'`).join(', ')})`);
  }
  if (af.tipoProponente?.length) {
    clauses.push(`${prefix}proponent_type IN (${af.tipoProponente.map(t => `'${t}'`).join(', ')})`);
  }
  if (af.gruposRepasse?.length) {
    clauses.push(`${prefix}grupos_repasse IN (${af.gruposRepasse.map(g => `'${g}'`).join(', ')})`);
  }

  return clauses.length > 0 ? clauses.join(' AND ') : '';
}

/**
 * Convenience: returns "WHERE <clauses>" or empty string.
 */
export function buildWhereClause(
  ctx: ToolContext,
  opts?: Parameters<typeof buildFilterClause>[1],
): string {
  const clause = buildFilterClause(ctx, opts);
  return clause ? `WHERE ${clause}` : '';
}

/**
 * Convenience: returns "AND <clauses>" or empty string.
 * Use when you already have a WHERE and need to append filters.
 */
export function buildAndClause(
  ctx: ToolContext,
  opts?: Parameters<typeof buildFilterClause>[1],
): string {
  const clause = buildFilterClause(ctx, { ...opts, dateMode: 'none' });
  return clause ? `AND ${clause}` : '';
}
```

- [ ] **Step 2: Verify build passes**

Run: `pnpm build`

- [ ] **Step 3: Commit**

```bash
git add src/features/ai-agents/tools/tool-context.ts
git commit -m "feat: create ToolContext type and SQL filter builder utility"
```

---

### Task 2: Add session-scoped BQML model naming + cleanup

**Files:**
- Modify: `src/features/ai-agents/tools/bqml-utils.ts`

- [ ] **Step 1: Update modelRef to accept sessionId**

Add a session-scoped variant of `modelRef`:

```typescript
/** Builds a session-scoped model reference to prevent concurrent user collisions. */
export function sessionModelRef(dataset: string, name: string, sessionId: string): string {
  // Use first 8 chars of sessionId for brevity
  const shortId = sessionId.substring(0, 8);
  return `\`${dataset}.bqml_${name}_${shortId}\``;
}

/** Drops a session-scoped model (fire-and-forget cleanup). */
export async function dropModel(dataset: string, modelName: string): Promise<void> {
  try {
    const bq = getBigQueryClient();
    const { datasetId, projectId } = parseDatasetRef(dataset);
    await bq.query({
      query: `DROP MODEL IF EXISTS ${modelName}`,
      useLegacySql: false,
      defaultDataset: { datasetId, ...(projectId ? { projectId } : {}) },
      jobTimeoutMs: 10_000,
    });
  } catch {
    // Best-effort cleanup — don't fail the request
  }
}
```

- [ ] **Step 2: Verify build passes**

Run: `pnpm build`

- [ ] **Step 3: Commit**

```bash
git add src/features/ai-agents/tools/bqml-utils.ts
git commit -m "feat: add session-scoped BQML model naming and cleanup utility"
```

---

### Task 3: Create unified LGD utility

**Files:**
- Create: `src/features/ai-agents/tools/lgd-utils.ts`

- [ ] **Step 1: Create lgd-utils.ts**

```typescript
// src/features/ai-agents/tools/lgd-utils.ts

/**
 * Unified LGD (Loss Given Default) SQL expressions.
 *
 * LGD = 1 - recovery_ratio, where recovery_ratio = valor_imovel / saldo_devedor.
 * Capped at [0, 1] range. Falls back to 0.45 when valor_imovel is NULL/0.
 *
 * This is the SINGLE source of truth for LGD computation across all tools.
 */

/** SQL expression for per-contract LGD (use in SELECT). */
export const LGD_EXPR = `LEAST(GREATEST(1 - SAFE_DIVIDE(valor_imovel, saldo_devedor), 0), 1)`;

/** SQL expression for per-contract LGD with NULL fallback. */
export const LGD_COALESCE_EXPR = `COALESCE(${LGD_EXPR}, 0.45)`;

/** Average LGD for a group (use in aggregate queries). */
export const LGD_AVG_EXPR = `AVG(${LGD_COALESCE_EXPR})`;
```

- [ ] **Step 2: Verify build passes**

Run: `pnpm build`

- [ ] **Step 3: Commit**

```bash
git add src/features/ai-agents/tools/lgd-utils.ts
git commit -m "feat: create unified LGD computation utility — single source of truth"
```

---

### Task 4: Migrate tool factories to ToolContext — batch 1 (monitoring + cashflow)

**Files:**
- Modify: `src/features/ai-agents/agents/monitoring-agent.ts`
- Modify: `src/features/ai-agents/agents/cashflow-agent.ts`
- Modify: `src/features/ai-agents/tools/check-eligibility.ts`
- Modify: `src/features/ai-agents/tools/check-concentration-limits.ts`
- Modify: `src/features/ai-agents/tools/check-covenant-triggers.ts`
- Modify: `src/features/ai-agents/tools/generate-compliance-report.ts`
- Modify: `src/features/ai-agents/tools/detect-anomalies.ts`
- Modify: `src/features/ai-agents/tools/calculate-wal.ts`
- Modify: `src/features/ai-agents/tools/calculate-excess-spread.ts`
- Modify: `src/features/ai-agents/tools/calculate-coverage-ratios.ts`
- Modify: `src/features/ai-agents/tools/compare-cashflows.ts`
- Modify: `src/features/ai-agents/tools/decompose-payments.ts`

The pattern for each tool:

1. Change factory signature from `(dataset: string)` to `(ctx: ToolContext)`
2. Import `ToolContext` and `buildAndClause` from `./tool-context`
3. Extract `const { dataset } = ctx;` at the top
4. After each `WHERE data_base_report = '${safeDataBase}'`, append `${buildAndClause(ctx)}`
5. For tools with `pagamentos` table, use `${buildAndClause(ctx)}` with projeto filter only (advanced filters are contratos-specific)

For agent files: change from `createXxxTool(ctx.dataset)` to `createXxxTool(toolCtx)` where `toolCtx` is built from the AgentDynamicContext.

- [ ] **Step 1: Update monitoring agent + all 5 monitoring tools**

Each monitoring tool's WHERE clause should get `${buildAndClause(ctx)}` appended. Example for check-eligibility:

```typescript
// Before:
WHERE data_base_report = '${safeDataBase}'

// After:
WHERE data_base_report = '${safeDataBase}' ${buildAndClause(ctx)}
```

- [ ] **Step 2: Update cashflow agent + all 5 cashflow tools**

Same pattern. For tools querying `pagamentos` or `fluxo_caixa`, use only the projeto filter (not advanced filters which are contratos-specific):

```typescript
const projetoClause = ctx.filters.projetos.length > 0
  ? `AND projeto IN (${ctx.filters.projetos.map(p => `'${p.replace(/'/g, "''")}'`).join(', ')})`
  : '';
```

- [ ] **Step 3: Verify build passes**

Run: `pnpm build`

- [ ] **Step 4: Commit**

```bash
git add src/features/ai-agents/agents/monitoring-agent.ts src/features/ai-agents/agents/cashflow-agent.ts src/features/ai-agents/tools/check-eligibility.ts src/features/ai-agents/tools/check-concentration-limits.ts src/features/ai-agents/tools/check-covenant-triggers.ts src/features/ai-agents/tools/generate-compliance-report.ts src/features/ai-agents/tools/detect-anomalies.ts src/features/ai-agents/tools/calculate-wal.ts src/features/ai-agents/tools/calculate-excess-spread.ts src/features/ai-agents/tools/calculate-coverage-ratios.ts src/features/ai-agents/tools/compare-cashflows.ts src/features/ai-agents/tools/decompose-payments.ts
git commit -m "feat: migrate monitoring + cashflow tools to ToolContext with filter injection"
```

---

### Task 5: Migrate tool factories to ToolContext — batch 2 (descriptive + diagnostic)

**Files:**
- Modify: `src/features/ai-agents/agents/descriptive-agent.ts`
- Modify: `src/features/ai-agents/agents/diagnostic-agent.ts`
- Modify: `src/features/ai-agents/tools/calculate-statistics.ts`
- Modify: `src/features/ai-agents/tools/build-vintage-curves.ts`
- Modify: `src/features/ai-agents/tools/build-transition-matrix.ts`
- Modify: `src/features/ai-agents/tools/calculate-correlations.ts`
- Modify: `src/features/ai-agents/tools/calculate-hhi.ts`
- Modify: `src/features/ai-agents/tools/decompose-variation.ts`
- Modify: `src/features/ai-agents/tools/run-hypothesis-test.ts`
- Modify: `src/features/ai-agents/tools/execute-sql.ts`
- Modify: `src/features/ai-agents/tools/get-table-schema.ts`
- Modify: `src/features/ai-agents/tools/get-sample-data.ts`

Same pattern as Task 4. For `execute_sql`, `get_table_schema`, `get_sample_data` — these are LLM-driven (freeform SQL), so the factory just needs to accept `ToolContext` for signature consistency but doesn't inject filters into the SQL (the LLM writes its own SQL guided by the prompt).

For `calculate_statistics`, `calculate_correlations`, `calculate_hhi`: these have a `whereClause` parameter. Inject context filters as a base, then append the LLM's whereClause on top.

- [ ] **Step 1: Update descriptive agent + tools**
- [ ] **Step 2: Update diagnostic agent + tools**
- [ ] **Step 3: Verify build passes**

Run: `pnpm build`

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: migrate descriptive + diagnostic tools to ToolContext with filter injection"
```

---

### Task 6: Migrate tool factories to ToolContext — batch 3 (predictive + simulation + prescriptive)

**Files:**
- Modify: `src/features/ai-agents/agents/predictive-agent.ts`
- Modify: `src/features/ai-agents/agents/simulation-agent.ts`
- Modify: `src/features/ai-agents/agents/prescriptive-agent.ts`
- Modify: All tools in these agents (~18 files)

Same pattern. For BQML tools, additionally:
1. Use `sessionModelRef` instead of `modelRef` for model names
2. Add `dropModel` cleanup in a finally block after model usage
3. For training queries: apply projeto filter but NOT advanced filters (training should be broader)

- [ ] **Step 1: Update predictive agent + tools (forecast, pd-lgd, survival, early-warnings, cpr-cdr)**

For `calculate-pd-lgd.ts` and `calculate-stressed-ecl.ts`: replace inline LGD formulas with imports from `lgd-utils.ts`.

- [ ] **Step 2: Update simulation agent + tools (scenario, sensitivity, monte-carlo, stress-macro, stressed-ecl)**
- [ ] **Step 3: Update prescriptive agent + tools (clustering, causal, allocation, rank, impact)**
- [ ] **Step 4: Verify build passes**

Run: `pnpm build`

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: migrate predictive + simulation + prescriptive tools to ToolContext, session-scoped models, unified LGD"
```

---

### Task 7: Migrate external agent + update orchestrators

**Files:**
- Modify: `src/features/ai-agents/agents/external-agent.ts`
- Modify: `src/features/ai-agents/orchestrator.ts`
- Modify: `src/features/canvas-orchestrator/orchestrator.ts`
- Modify: `app/api/chat/route.ts`
- Modify: `app/api/canvas-chat/route.ts`

- [ ] **Step 1: Update external agent**

External agent tools (`get_bcb_indicator`, `search_web`, etc.) don't query BigQuery directly, so they just need the signature update for consistency. `execute_sql` in external agent already handled in Task 5.

- [ ] **Step 2: Update main orchestrator to build ToolContext**

In `src/features/ai-agents/orchestrator.ts`, generate a `sessionId` and build `ToolContext`:

```typescript
import { randomUUID } from 'crypto';

// Inside createOrchestrator:
const sessionId = randomUUID().substring(0, 8);
const toolCtx: ToolContext = {
  dataset: input.dataset,
  filters: input.filters,
  sessionId,
};
```

Pass `toolCtx` to all agent factories.

- [ ] **Step 3: Update canvas orchestrator similarly**
- [ ] **Step 4: Verify build passes**

Run: `pnpm build`

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: update orchestrators to build ToolContext with sessionId, complete migration"
```

---

### Task 8: Fix BQML data leakage — temporal train/test split

**Files:**
- Modify: `src/features/ai-agents/tools/calculate-pd-lgd.ts`
- Modify: `src/features/ai-agents/tools/calculate-stressed-ecl.ts`
- Modify: `src/features/ai-agents/tools/build-survival-curve.ts`
- Modify: `src/features/ai-agents/tools/optimize-allocation.ts`

The core fix: for LOGISTIC_REG and BOOSTED_TREE models, train only on the LATEST snapshot per contract (not all historical snapshots). This eliminates same-contract autocorrelation. Also, remove `dias_atraso` from features since it defines the label.

- [ ] **Step 1: Fix calculate-pd-lgd training query**

Replace `WHERE data_contrato IS NOT NULL` with:
```sql
WHERE data_base_report = (SELECT MAX(data_base_report) FROM \`${dataset}.contratos\`)
  AND data_contrato IS NOT NULL
```

Remove `COALESCE(dias_atraso, 0) AS dias_atraso` from features. The model should predict default from LTV, taxa_juros, rating_numerico, prazo_decorrido — NOT from dias_atraso (which directly defines the label).

- [ ] **Step 2: Fix calculate-stressed-ecl training query**

Same changes as Step 1 (shared model name `pd_logistic`).

- [ ] **Step 3: Fix build-survival-curve training query**

Replace `WHERE data_contrato IS NOT NULL AND data_base_report IS NOT NULL` with latest-snapshot restriction. Keep `DATE_DIFF` as time feature since survival analysis needs temporal dimension.

- [ ] **Step 4: Fix optimize-allocation training query**

Same latest-snapshot restriction.

- [ ] **Step 5: Verify build passes**

Run: `pnpm build`

- [ ] **Step 6: Commit**

```bash
git commit -m "fix: eliminate BQML data leakage — train on latest snapshot, remove dias_atraso from PD features"
```

---

### Task 9: Final build verification + integration check

- [ ] **Step 1: Full build**

Run: `pnpm build`

- [ ] **Step 2: Verify all tool signatures are consistent**

Run: `grep -r "createExecuteSqlTool\|createCalculateStatisticsTool" src/features/ai-agents/agents/ --include="*.ts"`

Verify all calls pass ToolContext (or `toolCtx`) instead of `ctx.dataset`.

- [ ] **Step 3: Verify no orphan `dataset: string` signatures remain**

Run: `grep -r "export function create.*Tool(dataset: string" src/features/ai-agents/tools/ --include="*.ts"`

Should return 0 results (all migrated to ToolContext).

- [ ] **Step 4: Commit plan update**

```bash
git add docs/superpowers/plans/2026-03-25-ai-architectural-fixes.md
git commit -m "docs: add architectural fixes implementation plan"
```
