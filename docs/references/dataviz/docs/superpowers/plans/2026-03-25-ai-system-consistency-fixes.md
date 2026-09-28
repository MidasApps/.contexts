# AI System Consistency Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 20 inconsistencies found across the multi-agent AI system (agents, tools, schemas, prompts, SQL queries, canvas orchestrator, API routes).

**Architecture:** Targeted fixes to existing files. No new architecture needed — this is a bug-fix pass across the AI system.

**Tech Stack:** TypeScript, Zod, BigQuery SQL, Vercel AI SDK

---

## File Map

| File | Changes |
|------|---------|
| `src/shared/lib/bigquery/queries.ts` | Fix elegibilidade accent mismatch |
| `src/shared/providers/DataProvider.tsx` | Fix elegibilidade accent mismatch |
| `src/features/ai-agents/tools/optimize-allocation.ts` | Fix COALESCE(ltv, 100) → COALESCE(ltv, 1.0) |
| `src/features/canvas-orchestrator/tools/query-data.ts` | Enforce allowedPatterns + add defaultDataset |
| `src/features/canvas-orchestrator/tools/update-block.ts` | Add update_kpi_block (singular), fix type mismatch |
| `src/features/canvas-orchestrator/tools/plan-analysis.ts` | Fix enum 'kpis' → 'kpi' |
| `src/features/canvas-orchestrator/orchestrator.ts` | Register update_kpi_block, remove add_kpis_block |
| `src/features/ai-agents/tools/run-scenario.ts` | Replace RAND() with deterministic FARM_FINGERPRINT |
| `src/features/ai-agents/tools/calculate-cpr-cdr.ts` | Fix date format mismatch + dead code |
| `src/features/ai-agents/tools/bqml-utils.ts` | Strengthen safeWhereClause (block UNION, subqueries) |
| `src/features/ai-agents/agents/diagnostic-agent.ts` | Add get_table_schema + get_sample_data tools |
| `src/shared/config/agents/external-agent.ts` | Add enum mapping table for BCB indicators |
| `app/api/canvas-chat/route.ts` | Pass dashboardState/page, add try/catch |
| `app/api/chat/route.ts` | Add try/catch for malformed JSON |
| `src/features/ai-agents/tools/build-vintage-curves.ts` | Add optional date filter |
| `src/shared/config/agents/canvas-orchestrator.ts` | Update prompt to reflect kpi (singular) tools |

---

### Task 1: Fix elegibilidade accent mismatch (CRITICAL)

**Files:**
- Modify: `src/shared/lib/bigquery/queries.ts:34`
- Modify: `src/shared/providers/DataProvider.tsx:47`

The BigQuery data stores `'Elegivel'` / `'Nao Elegivel'` (no accents). The dashboard sends accented versions which never match.

- [ ] **Step 1: Fix ALLOWED_VALUES in queries.ts**

In `src/shared/lib/bigquery/queries.ts` line 34, change:
```typescript
elegibilidade: new Set(['Elegível', 'Não Elegível']),
```
to:
```typescript
elegibilidade: new Set(['Elegivel', 'Nao Elegivel', 'Elegível', 'Não Elegível']),
```

This accepts both forms. The sanitize function will pass them through to SQL.

- [ ] **Step 2: Add normalization in buildAdvancedWhere**

After the sanitize call for elegibilidade (line 60), normalize accented values:
```typescript
const eleg = sanitize(filters.elegibilidade, 'elegibilidade')
  .map(v => v.replace('Elegível', 'Elegivel').replace('Não Elegível', 'Nao Elegivel'));
```

- [ ] **Step 3: Verify build passes**

Run: `pnpm build`

- [ ] **Step 4: Commit**

```bash
git add src/shared/lib/bigquery/queries.ts
git commit -m "fix: normalize elegibilidade accents in SQL filter to match BigQuery data"
```

---

### Task 2: Fix COALESCE(ltv, 100) in optimize-allocation (CRITICAL)

**Files:**
- Modify: `src/features/ai-agents/tools/optimize-allocation.ts:147`

LTV is a decimal (0.53 = 53%). COALESCE fallback of 100 is wrong — should be 1.0.

- [ ] **Step 1: Fix the COALESCE value**

In `src/features/ai-agents/tools/optimize-allocation.ts` line 147, change:
```typescript
? '0.5 * CASE WHEN elegivel_cri THEN 1 ELSE 0 END + 0.3 * (1 - COALESCE(ltv, 100) / 100.0) + 0.2 * CASE WHEN dias_atraso = 0 THEN 1 ELSE 0 END'
```
to:
```typescript
? '0.5 * CASE WHEN elegivel_cri THEN 1 ELSE 0 END + 0.3 * (1 - COALESCE(ltv, 1.0)) + 0.2 * CASE WHEN dias_atraso = 0 THEN 1 ELSE 0 END'
```

- [ ] **Step 2: Verify build passes**

Run: `pnpm build`

- [ ] **Step 3: Commit**

```bash
git add src/features/ai-agents/tools/optimize-allocation.ts
git commit -m "fix: correct COALESCE(ltv, 100) to COALESCE(ltv, 1.0) — LTV is decimal not percent"
```

---

### Task 3: Fix query-data.ts — enforce allowedPatterns + add defaultDataset (CRITICAL)

**Files:**
- Modify: `src/features/canvas-orchestrator/tools/query-data.ts`

Two bugs: (1) allowedPatterns defined but never tested, (2) no defaultDataset passed.

- [ ] **Step 1: Add allowedPatterns check and defaultDataset**

Replace the execute function in `query-data.ts`:
```typescript
import { getBigQueryClient, parseDatasetRef } from '@/shared/lib/bigquery/client';

// ... inside createQueryDataTool:
execute: async ({ sql, description }) => {
  const normalized = sql.trim();
  if (!allowedPatterns.test(normalized)) {
    return { success: false, error: 'Query deve começar com SELECT, WITH' + (bqmlEnabled ? ' ou CREATE MODEL' : ''), rowCount: 0 };
  }
  if (blockedPatterns.test(normalized)) {
    return { success: false, error: bqmlEnabled ? 'Operação não permitida. Apenas SELECT, WITH e CREATE MODEL são permitidos.' : 'Apenas queries SELECT/WITH são permitidas', rowCount: 0 };
  }
  try {
    const client = getBigQueryClient();
    const { datasetId, projectId } = parseDatasetRef(dataset);
    const isMLQuery = /CREATE\s+(OR\s+REPLACE\s+)?MODEL\b/i.test(sql);
    const [rows] = await client.query({
      query: sql,
      useLegacySql: false,
      defaultDataset: { datasetId, ...(projectId ? { projectId } : {}) },
      jobTimeoutMs: isMLQuery ? 300_000 : 60_000,
    });
    const truncated = rows.slice(0, MAX_ROWS_TO_LLM);
    return {
      success: true,
      description,
      rowCount: rows.length,
      truncatedToLlm: rows.length > MAX_ROWS_TO_LLM,
      data: truncated,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro na query',
      sql,
      rowCount: 0,
    };
  }
},
```

- [ ] **Step 2: Verify build passes**

Run: `pnpm build`

- [ ] **Step 3: Commit**

```bash
git add src/features/canvas-orchestrator/tools/query-data.ts
git commit -m "fix: enforce SQL allowlist and add defaultDataset in canvas query-data tool"
```

---

### Task 4: Fix KPI block type inconsistency (HIGH)

**Files:**
- Modify: `src/features/canvas-orchestrator/tools/update-block.ts` — add createUpdateKpiBlockTool
- Modify: `src/features/canvas-orchestrator/tools/plan-analysis.ts:14` — fix enum
- Modify: `src/features/canvas-orchestrator/orchestrator.ts` — register new tool, remove deprecated
- Modify: `src/shared/config/agents/canvas-orchestrator.ts` — update prompt

- [ ] **Step 1: Add createUpdateKpiBlockTool in update-block.ts**

Add after createUpdateKpisBlockTool:
```typescript
export function createUpdateKpiBlockTool() {
  return tool({
    description: 'Atualiza um bloco KPI individual (SingleKpiBlock). IMPORTANTE: Sempre consulte dados históricos para sparklineData.',
    inputSchema: z.object({
      blockId: z.string().describe('ID do bloco a atualizar'),
      label: z.string().optional().describe('Rótulo do KPI'),
      value: z.string().optional().describe('Valor formatado'),
      description: z.string().optional().describe('Descrição breve'),
      trend: z.string().optional().describe('Variação percentual vs período anterior'),
      trendDirection: z.enum(['up', 'down']).optional(),
      trendIsPositive: z.boolean().optional(),
      sparklineData: z.array(z.number()).optional().describe('Array com ~10 valores dos últimos meses'),
      sparklineMonths: z.array(z.string()).optional().describe('Meses no formato YYYY-MM'),
      previousValue: z.string().optional(),
      deltaPercent: z.string().optional(),
    }),
    execute: async ({ blockId, ...fields }) => {
      const updates: Record<string, unknown> = { type: 'kpi' as const };
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) updates[k] = v;
      }
      return { action: 'update_block', blockId, updates };
    },
  });
}
```

- [ ] **Step 2: Fix plan-analysis.ts enum**

In `src/features/canvas-orchestrator/tools/plan-analysis.ts` line 14, change:
```typescript
type: z.enum(['text', 'kpis', 'chart', 'table']),
```
to:
```typescript
type: z.enum(['text', 'kpi', 'chart', 'table']),
```

- [ ] **Step 3: Update orchestrator — register update_kpi_block, remove add_kpis_block**

In `src/features/canvas-orchestrator/orchestrator.ts`:

Update import line 10:
```typescript
import { createUpdateTextBlockTool, createUpdateKpiBlockTool, createUpdateKpisBlockTool, createUpdateChartBlockTool, createUpdateTableBlockTool } from './tools/update-block';
```

Remove import of createAddKpisBlockTool from line 7:
```typescript
import { createAddTextBlockTool, createAddKpiBlockTool, createAddChartBlockTool, createAddTableBlockTool } from './tools/add-block';
```

In the tools map:
- Remove: `add_kpis_block: createAddKpisBlockTool(),` (line 52)
- Add: `update_kpi_block: createUpdateKpiBlockTool(),` (after update_kpis_block)

- [ ] **Step 4: Update canvas orchestrator prompt**

In `src/shared/config/agents/canvas-orchestrator.ts`, update the tool reference table to replace references to `add_kpis_block` with `add_kpi_block` (singular) and add `update_kpi_block` to the update tools list. Remove the "NÃO use add_kpis_block (deprecated)" warning.

- [ ] **Step 5: Verify build passes**

Run: `pnpm build`

- [ ] **Step 6: Commit**

```bash
git add src/features/canvas-orchestrator/tools/update-block.ts src/features/canvas-orchestrator/tools/plan-analysis.ts src/features/canvas-orchestrator/orchestrator.ts src/shared/config/agents/canvas-orchestrator.ts
git commit -m "fix: add update_kpi_block tool, fix kpi/kpis type inconsistency, remove deprecated add_kpis_block"
```

---

### Task 5: Fix run-scenario.ts non-deterministic RAND() (HIGH)

**Files:**
- Modify: `src/features/ai-agents/tools/run-scenario.ts:32`

- [ ] **Step 1: Replace RAND() with deterministic selection**

In `src/features/ai-agents/tools/run-scenario.ts`, change line 32:
```sql
CASE
  WHEN RAND() < ${p.pct_afetados} THEN dias_atraso + ${p.aumento_atraso}
  ELSE dias_atraso
END AS dias_atraso_stressed
```
to:
```sql
CASE
  WHEN MOD(ABS(FARM_FINGERPRINT(CAST(id_contrato AS STRING))), 100) < ${p.pct_afetados * 100} THEN dias_atraso + ${p.aumento_atraso}
  ELSE dias_atraso
END AS dias_atraso_stressed
```

FARM_FINGERPRINT is deterministic — same contract always gets same hash, so the same scenario always produces the same results.

- [ ] **Step 2: Verify build passes**

Run: `pnpm build`

- [ ] **Step 3: Commit**

```bash
git add src/features/ai-agents/tools/run-scenario.ts
git commit -m "fix: replace RAND() with deterministic FARM_FINGERPRINT for reproducible stress scenarios"
```

---

### Task 6: Fix calculate-cpr-cdr.ts date format mismatch + dead code (HIGH)

**Files:**
- Modify: `src/features/ai-agents/tools/calculate-cpr-cdr.ts`

- [ ] **Step 1: Fix safeDateOrMonth to always return YYYY-MM for this tool**

In `src/features/ai-agents/tools/calculate-cpr-cdr.ts`, change lines 18-20:
```typescript
const dateFilter = startDate && endDate
  ? `WHERE FORMAT_DATE('%Y-%m', data_base_report) BETWEEN '${safeDateOrMonth(startDate)}' AND '${safeDateOrMonth(endDate)}'`
  : 'WHERE data_base_report >= DATE_SUB(CURRENT_DATE(), INTERVAL 12 MONTH)';
```
to:
```typescript
// Normalize dates to YYYY-MM for FORMAT_DATE comparison
const toMonth = (d: string) => safeDateOrMonth(d).substring(0, 7);
const dateFilter = startDate && endDate
  ? `WHERE FORMAT_DATE('%Y-%m', data_base_report) BETWEEN '${toMonth(startDate)}' AND '${toMonth(endDate)}'`
  : 'WHERE data_base_report >= DATE_SUB(CURRENT_DATE(), INTERVAL 12 MONTH)';
```

- [ ] **Step 2: Remove dead .replace() on line 130**

Change line 130:
```typescript
${dateFilter.replace('p.data_base_report', 'data_base_report')}
```
to:
```typescript
${dateFilter}
```

- [ ] **Step 3: Verify build passes**

Run: `pnpm build`

- [ ] **Step 4: Commit**

```bash
git add src/features/ai-agents/tools/calculate-cpr-cdr.ts
git commit -m "fix: normalize date format to YYYY-MM in CPR/CDR tool, remove dead string replace"
```

---

### Task 7: Strengthen safeWhereClause (MEDIUM)

**Files:**
- Modify: `src/features/ai-agents/tools/bqml-utils.ts:44-51`

- [ ] **Step 1: Block UNION, subqueries, and other dangerous patterns**

Replace `safeWhereClause` function:
```typescript
export function safeWhereClause(clause: string): string {
  const FORBIDDEN = /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|MERGE|EXEC|EXECUTE|GRANT|REVOKE|UNION|INTO\s+OUTFILE|LOAD_FILE)\b/i;
  if (FORBIDDEN.test(clause)) {
    throw new Error('WHERE clause contains forbidden SQL keywords.');
  }
  // Block subqueries (SELECT inside WHERE)
  if (/\bSELECT\b/i.test(clause)) {
    throw new Error('WHERE clause cannot contain SELECT subqueries.');
  }
  // Strip inline comments and semicolons
  return clause.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/;/g, '').trim();
}
```

- [ ] **Step 2: Verify build passes**

Run: `pnpm build`

- [ ] **Step 3: Commit**

```bash
git add src/features/ai-agents/tools/bqml-utils.ts
git commit -m "fix: strengthen safeWhereClause to block UNION, subqueries, and data exfiltration"
```

---

### Task 8: Add schema exploration tools to diagnostic agent (MEDIUM)

**Files:**
- Modify: `src/features/ai-agents/agents/diagnostic-agent.ts`

- [ ] **Step 1: Add get_table_schema and get_sample_data imports and tools**

Add imports:
```typescript
import { createGetTableSchemaTool } from '../tools/get-table-schema';
import { createGetSampleDataTool } from '../tools/get-sample-data';
```

Add to tools map:
```typescript
get_table_schema: createGetTableSchemaTool(ctx.dataset),
get_sample_data: createGetSampleDataTool(ctx.dataset),
```

- [ ] **Step 2: Verify build passes**

Run: `pnpm build`

- [ ] **Step 3: Commit**

```bash
git add src/features/ai-agents/agents/diagnostic-agent.ts
git commit -m "fix: add schema exploration tools to diagnostic agent for ad-hoc SQL support"
```

---

### Task 9: Fix external agent BCB indicator enum mapping (MEDIUM)

**Files:**
- Modify: `src/shared/config/agents/external-agent.ts`

- [ ] **Step 1: Add tool enum values to the BCB table**

Update the BCB table in the prompt to include the tool's enum value:
```typescript
## Códigos BCB SGS
| Indicador | Código SGS | Tool Enum | Frequência |
|-----------|-----------|-----------|------------|
| Selic Meta | 432 | selic_meta | Diária |
| Selic Over | 1178 | selic_over | Diária |
| IPCA | 433 | ipca | Mensal |
| IGP-M | 189 | igpm | Mensal |
| CDI | 4389 | cdi | Diária |
| Câmbio USD/BRL | 1 | cambio_usd | Diária |

Ao chamar a tool get_bcb_indicator, use os valores da coluna "Tool Enum" no parâmetro indicator.
```

- [ ] **Step 2: Verify build passes**

Run: `pnpm build`

- [ ] **Step 3: Commit**

```bash
git add src/shared/config/agents/external-agent.ts
git commit -m "fix: add tool enum values to BCB indicator table in external agent prompt"
```

---

### Task 10: Fix canvas-chat API route — pass context + add error handling (MEDIUM)

**Files:**
- Modify: `app/api/canvas-chat/route.ts`
- Modify: `app/api/chat/route.ts`

- [ ] **Step 1: Fix canvas-chat route to pass dashboardState/page and add try/catch**

Replace `app/api/canvas-chat/route.ts`:
```typescript
import type { UIMessage } from 'ai';
import type { ChatRequestFilters, CanvasPageContext } from '@/shared/config/agents/types';
import { createCanvasOrchestrator } from '@/features/canvas-orchestrator/orchestrator';
import { verifyAuthToken, verifyDatasetAccess } from '@/shared/lib/api-auth';

export const maxDuration = 600;

export async function POST(req: Request) {
  const email = await verifyAuthToken(req);
  if (!email) {
    return new Response(JSON.stringify({ error: 'Nao autenticado' }), { status: 401 });
  }

  let body: {
    messages: UIMessage[];
    dataset: string;
    filters: ChatRequestFilters;
    pagesContext: CanvasPageContext[];
    bqmlEnabled?: boolean;
    selectedBlockIds?: string[];
    dashboardState?: string;
    page?: string;
  };

  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'JSON inválido' }), { status: 400 });
  }

  if (!body.dataset || !body.messages) {
    return new Response(JSON.stringify({ error: 'Campos obrigatórios: dataset, messages' }), { status: 400 });
  }

  const access = await verifyDatasetAccess(email, body.dataset);
  if (!access.allowed) {
    return new Response(JSON.stringify({ error: access.error }), { status: access.status });
  }

  const result = await createCanvasOrchestrator({
    messages: body.messages,
    dataset: body.dataset,
    filters: body.filters,
    pagesContext: body.pagesContext ?? [],
    bqmlEnabled: body.bqmlEnabled ?? false,
    selectedBlockIds: body.selectedBlockIds ?? [],
    dashboardState: body.dashboardState,
    page: body.page,
  });

  return result.toUIMessageStreamResponse();
}
```

- [ ] **Step 2: Add try/catch to chat route**

In `app/api/chat/route.ts`, wrap `await req.json()` in try/catch:
```typescript
let body: { ... };
try {
  body = await req.json();
} catch {
  return new Response(JSON.stringify({ error: 'JSON inválido' }), { status: 400 });
}
```

- [ ] **Step 3: Verify build passes**

Run: `pnpm build`

- [ ] **Step 4: Commit**

```bash
git add app/api/canvas-chat/route.ts app/api/chat/route.ts
git commit -m "fix: pass dashboardState/page to canvas orchestrator, add request body validation"
```

---

### Task 11: Add date filter to build-vintage-curves (LOW)

**Files:**
- Modify: `src/features/ai-agents/tools/build-vintage-curves.ts`

- [ ] **Step 1: Add optional date range parameter**

Add to inputSchema:
```typescript
startDate: z.string().optional().describe('Data inicial (YYYY-MM-DD). Se omitida, inclui todos os dados.'),
endDate: z.string().optional().describe('Data final (YYYY-MM-DD).'),
```

Add date filter to the SQL query, after the INNER JOIN:
```sql
${startDate && endDate ? `WHERE c.data_base_report BETWEEN '${safeDate(startDate)}' AND '${safeDate(endDate)}'` : ''}
```

Import safeDate:
```typescript
import { safeDate } from './bqml-utils';
```

- [ ] **Step 2: Verify build passes**

Run: `pnpm build`

- [ ] **Step 3: Commit**

```bash
git add src/features/ai-agents/tools/build-vintage-curves.ts
git commit -m "fix: add optional date range filter to vintage curves tool to limit table scan"
```

---

### Task 12: Final build verification

- [ ] **Step 1: Full build**

Run: `pnpm build`

- [ ] **Step 2: Lint**

Run: `pnpm lint`

- [ ] **Step 3: Fix any remaining issues**
