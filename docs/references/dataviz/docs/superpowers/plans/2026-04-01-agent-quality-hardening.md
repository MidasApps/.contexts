# Agent Quality Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the AI agent system with column validation, error formatting, result limits, richer tool descriptions, tool selection guides, graceful degradation, and frontend safety fixes — all derived from claude-code-5 best practices applied to the Liquid DataViz context.

**Architecture:** Shared utilities (`column-validator.ts`, `format-error.ts`, `truncate-result.ts`) consumed by all tools, prompt improvements in agent config files, and targeted frontend fixes. Each task is independent and produces a clean commit.

**Tech Stack:** TypeScript, Vercel AI SDK, Zod, BigQuery, React

---

### Task 1: Column Validator with Schema Whitelist

**Files:**
- Create: `src/features/ai-agents/lib/column-validator.ts`
- Modify: `src/features/ai-agents/tools/bqml-utils.ts:39-41`
- Modify: `src/features/ai-agents/tools/calculate-statistics.ts:20`
- Modify: `src/features/ai-agents/tools/calculate-hhi.ts:21-22`
- Modify: `src/features/ai-agents/tools/calculate-correlations.ts:21-22`
- Modify: `src/features/ai-agents/tools/decompose-variation.ts:23-24`
- Modify: `src/features/ai-agents/tools/detect-anomalies.ts:20`
- Modify: `src/features/ai-agents/tools/forecast-timeseries.ts:29`

Currently, tools sanitize column names with `column.replace(/[^a-zA-Z0-9_]/g, '')` which silently transforms invalid input. The LLM asks for `saldo devedor`, it becomes `saldodevedor`, and the query fails without useful feedback. Claude Code 5 validates inputs with explicit rejection and suggestions.

- [ ] **Step 1: Create the column validator**

```typescript
// src/features/ai-agents/lib/column-validator.ts

/**
 * Whitelist of valid column names from the contratos table schema.
 * Used to validate LLM-provided column names before SQL interpolation.
 */
const CONTRATOS_COLUMNS = new Set([
  'id_contrato', 'data_base_report', 'data_contrato', 'projeto',
  'nome_empreendimento', 'documento', 'nome_cliente', 'proponent_type',
  'unidade', 'data_emissao', 'safra', 'saldo_devedor', 'saldo_nominal',
  'valor_imovel', 'ltv', 'faixa_ltv', 'rating_liquid', 'elegibilidade',
  'elegivel_cri', 'dias_atraso', 'faixa_atraso', 'valor_atraso',
  'valor_over_90', 'pdd_minimo_bacen', 'pdd_liquid', 'delta_pdd',
  'pricing', 'taxa_juros', 'correcao_monetaria', 'prazo_decorrido',
  'prazo_remanescente', 'restricoes', 'grupos_repasse',
  'renda_suficiente', 'limite_simulacao', 'private_area',
]);

/** Numeric columns that can be used in aggregations (SUM, AVG, etc.) */
const NUMERIC_COLUMNS = new Set([
  'saldo_devedor', 'saldo_nominal', 'valor_imovel', 'ltv',
  'dias_atraso', 'valor_atraso', 'valor_over_90', 'pdd_minimo_bacen',
  'pdd_liquid', 'delta_pdd', 'pricing', 'taxa_juros',
  'correcao_monetaria', 'prazo_decorrido', 'prazo_remanescente',
  'restricoes', 'renda_suficiente', 'limite_simulacao', 'private_area',
]);

/** Dimension columns usable for GROUP BY */
const DIMENSION_COLUMNS = new Set([
  'id_contrato', 'projeto', 'nome_empreendimento', 'documento',
  'nome_cliente', 'proponent_type', 'safra', 'faixa_ltv',
  'rating_liquid', 'elegibilidade', 'faixa_atraso', 'grupos_repasse',
]);

type ColumnKind = 'any' | 'numeric' | 'dimension';

interface ValidResult { valid: true; column: string }
interface InvalidResult { valid: false; error: string }

export function validateColumn(input: string, kind: ColumnKind = 'any'): ValidResult | InvalidResult {
  const clean = input.trim().toLowerCase().replace(/\s+/g, '_');
  const pool = kind === 'numeric' ? NUMERIC_COLUMNS
    : kind === 'dimension' ? DIMENSION_COLUMNS
    : CONTRATOS_COLUMNS;

  if (pool.has(clean)) return { valid: true, column: clean };

  // Fuzzy: find columns that contain the input or vice versa
  const suggestions = [...pool].filter(c => c.includes(clean) || clean.includes(c));

  if (suggestions.length > 0) {
    return { valid: false, error: `Coluna "${input}" não encontrada. Você quis dizer: ${suggestions.join(', ')}?` };
  }
  return { valid: false, error: `Coluna "${input}" não existe na tabela contratos. Colunas ${kind === 'numeric' ? 'numéricas' : kind === 'dimension' ? 'de dimensão' : ''} válidas: ${[...pool].slice(0, 15).join(', ')}...` };
}
```

- [ ] **Step 2: Replace safeColumn in bqml-utils.ts**

In `src/features/ai-agents/tools/bqml-utils.ts`, replace the `safeColumn` function (line 39-41):

```typescript
// Old:
export function safeColumn(col: string): string {
  return col.replace(/[^a-zA-Z0-9_]/g, '');
}

// New:
import { validateColumn } from '@/features/ai-agents/lib/column-validator';

export function safeColumn(col: string): string {
  const result = validateColumn(col, 'numeric');
  if (!result.valid) throw new Error(result.error);
  return result.column;
}
```

- [ ] **Step 3: Replace regex sanitization in calculate-statistics.ts**

In `src/features/ai-agents/tools/calculate-statistics.ts`, replace line 20:

```typescript
// Old:
const safeCol = column.replace(/[^a-zA-Z0-9_]/g, '');

// New:
import { validateColumn } from '@/features/ai-agents/lib/column-validator';
// ... (add import at top)
const validation = validateColumn(column, 'numeric');
if (!validation.valid) return { success: false, error: validation.error };
const safeCol = validation.column;
```

- [ ] **Step 4: Replace regex sanitization in calculate-hhi.ts**

In `src/features/ai-agents/tools/calculate-hhi.ts`, replace lines 21-22:

```typescript
// Old:
const safeDim = dimension.replace(/[^a-zA-Z0-9_]/g, '');
const safeVal = valueColumn.replace(/[^a-zA-Z0-9_]/g, '');

// New:
import { validateColumn } from '@/features/ai-agents/lib/column-validator';
// ... (add import at top)
const dimResult = validateColumn(dimension, 'dimension');
if (!dimResult.valid) return { success: false, error: dimResult.error };
const safeDim = dimResult.column;
const valResult = validateColumn(valueColumn, 'numeric');
if (!valResult.valid) return { success: false, error: valResult.error };
const safeVal = valResult.column;
```

- [ ] **Step 5: Apply same pattern to calculate-correlations.ts, decompose-variation.ts**

In `calculate-correlations.ts` (lines 21-22), replace:
```typescript
const c1 = column1.replace(/[^a-zA-Z0-9_]/g, '');
const c2 = column2.replace(/[^a-zA-Z0-9_]/g, '');
```
With validation using `validateColumn(column1, 'numeric')` and `validateColumn(column2, 'numeric')`, returning error on invalid.

In `decompose-variation.ts` (lines 23-24), replace:
```typescript
const safeMetric = metric.replace(/[^a-zA-Z0-9_]/g, '');
const safeDim = dimension.replace(/[^a-zA-Z0-9_]/g, '');
```
With `validateColumn(metric, 'numeric')` and `validateColumn(dimension, 'dimension')`.

- [ ] **Step 6: Verify build passes**

Run: `pnpm build`

- [ ] **Step 7: Commit**

```bash
git add src/features/ai-agents/lib/column-validator.ts src/features/ai-agents/tools/bqml-utils.ts src/features/ai-agents/tools/calculate-statistics.ts src/features/ai-agents/tools/calculate-hhi.ts src/features/ai-agents/tools/calculate-correlations.ts src/features/ai-agents/tools/decompose-variation.ts src/features/ai-agents/tools/detect-anomalies.ts src/features/ai-agents/tools/forecast-timeseries.ts
git commit -m "feat(agents): replace regex column sanitization with schema whitelist validation"
```

---

### Task 2: Error Formatting with Truncation

**Files:**
- Create: `src/features/ai-agents/lib/format-error.ts`
- Modify: `src/features/ai-agents/tools/execute-sql.ts:56-59`
- Modify: `src/features/ai-agents/tools/calculate-statistics.ts:50-51`
- Modify: `src/features/ai-agents/tools/calculate-hhi.ts:57-58`
- Modify: `src/features/ai-agents/tools/calculate-correlations.ts:58-59`
- Modify: `src/features/ai-agents/tools/decompose-variation.ts:56-57`
- Modify: `src/features/ai-agents/tools/detect-anomalies.ts:130`
- Modify: `src/features/ai-agents/tools/forecast-timeseries.ts` (all catch blocks)

Raw BigQuery errors can be hundreds of lines. Claude Code 5 truncates errors at 10K chars with head/tail preview. We use a smaller limit (2K) because our error strings go into the LLM context.

- [ ] **Step 1: Create the error formatter**

```typescript
// src/features/ai-agents/lib/format-error.ts

const MAX_ERROR_CHARS = 2000;

/**
 * Formats a tool error for LLM consumption.
 * - Truncates long error messages with head/tail preview
 * - Strips BigQuery internal metadata (job IDs, project references)
 * - Returns a clean, actionable error message
 */
export function formatToolError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);

  // Strip noisy BigQuery metadata
  const cleaned = raw
    .replace(/\bJob\s+[a-zA-Z0-9_:-]+\b/g, '[job]')
    .replace(/\b[a-z]+-[a-z]+-\d+\.[\w.]+\b/g, '[project]')
    .trim();

  if (cleaned.length <= MAX_ERROR_CHARS) return cleaned;

  const half = Math.floor(MAX_ERROR_CHARS / 2);
  return `${cleaned.slice(0, half)}\n\n... [${cleaned.length - MAX_ERROR_CHARS} caracteres omitidos] ...\n\n${cleaned.slice(-half)}`;
}
```

- [ ] **Step 2: Apply formatToolError to all tool catch blocks**

In each tool's catch block, replace:
```typescript
error: err instanceof Error ? err.message : String(err)
```
With:
```typescript
import { formatToolError } from '@/features/ai-agents/lib/format-error';
// ...
error: formatToolError(err)
```

Apply to: `execute-sql.ts`, `calculate-statistics.ts`, `calculate-hhi.ts`, `calculate-correlations.ts`, `decompose-variation.ts`, `detect-anomalies.ts` (line 130), and `forecast-timeseries.ts` (all catch blocks).

Also apply to `canvas-orchestrator/tools/query-data.ts` (line 48).

- [ ] **Step 3: Verify build passes**

Run: `pnpm build`

- [ ] **Step 4: Commit**

```bash
git add src/features/ai-agents/lib/format-error.ts src/features/ai-agents/tools/ src/features/canvas-orchestrator/tools/query-data.ts
git commit -m "feat(agents): add error formatting with truncation for tool errors"
```

---

### Task 3: Result Limits on Remaining Tools

**Files:**
- Create: `src/features/ai-agents/lib/truncate-result.ts`
- Modify: `src/features/ai-agents/tools/detect-anomalies.ts`
- Modify: `src/features/canvas-orchestrator/tools/query-data.ts`
- Modify: `src/features/canvas-orchestrator/tools/get-filter-options.ts`

Several tools still return unbounded results: `detect-anomalies` returns `all_points` without limit, `query-data` has row limit but no char limit, `get-filter-options` has no LIMIT on the projetos query.

- [ ] **Step 1: Create the reusable truncation utility**

```typescript
// src/features/ai-agents/lib/truncate-result.ts

const DEFAULT_MAX_ROWS = 500;
const DEFAULT_MAX_CHARS = 50_000;

/**
 * Truncates an array of results to fit within row and character budgets.
 * Uses binary search to find the maximum number of rows that fit in the char budget.
 */
export function truncateResult<T>(
  data: T[],
  maxRows = DEFAULT_MAX_ROWS,
  maxChars = DEFAULT_MAX_CHARS,
): { data: T[]; truncated: boolean; totalCount: number; returnedCount: number } {
  const totalCount = data.length;
  let result = data.slice(0, maxRows);

  const serialized = JSON.stringify(result);
  if (serialized.length > maxChars) {
    let lo = 0;
    let hi = result.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (JSON.stringify(result.slice(0, mid)).length <= maxChars) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    result = result.slice(0, lo);
  }

  return {
    data: result,
    truncated: result.length < totalCount,
    totalCount,
    returnedCount: result.length,
  };
}
```

- [ ] **Step 2: Apply to detect-anomalies.ts**

In `detect-anomalies.ts`, for both the BQML path (line 66-76) and the fallback path (line 118-128):

Replace the `all_points: anomalies` / `all_points: rows` with truncated versions. Import `truncateResult` at top.

For the BQML path (~line 66):
```typescript
import { truncateResult } from '@/features/ai-agents/lib/truncate-result';

// Replace the return block:
const truncatedAll = truncateResult(anomalies, 200);
return {
  success: true,
  method: 'BQML_ARIMA_PLUS',
  metric: col,
  aggregation: rawAgg,
  anomaly_threshold: anomalyThreshold,
  anomalyCount,
  totalPoints: anomalies.length,
  anomalies: anomalies.filter((r) => r.is_anomaly === true),
  all_points: truncatedAll.data,
  all_points_truncated: truncatedAll.truncated,
};
```

Same pattern for the fallback path (~line 118).

- [ ] **Step 3: Apply char limit to canvas query-data.ts**

In `src/features/canvas-orchestrator/tools/query-data.ts`, replace the truncation logic (lines 37-44):

```typescript
import { truncateResult } from '@/features/ai-agents/lib/truncate-result';

// Replace lines 37-44:
const { data: truncated, truncated: wasTruncated, totalCount } = truncateResult(rows);
return {
  success: true,
  description,
  rowCount: totalCount,
  returnedRows: truncated.length,
  truncated: wasTruncated,
  data: truncated,
};
```

- [ ] **Step 4: Add LIMIT to get-filter-options.ts projetos query**

In `src/features/canvas-orchestrator/tools/get-filter-options.ts`, line 17, add LIMIT:

```typescript
// Old:
query: `SELECT DISTINCT projeto FROM \`${dataset}.contratos\` WHERE projeto IS NOT NULL ORDER BY projeto`,

// New:
query: `SELECT DISTINCT projeto FROM \`${dataset}.contratos\` WHERE projeto IS NOT NULL ORDER BY projeto LIMIT 200`,
```

- [ ] **Step 5: Verify build passes**

Run: `pnpm build`

- [ ] **Step 6: Commit**

```bash
git add src/features/ai-agents/lib/truncate-result.ts src/features/ai-agents/tools/detect-anomalies.ts src/features/canvas-orchestrator/tools/query-data.ts src/features/canvas-orchestrator/tools/get-filter-options.ts
git commit -m "feat(agents): add result truncation to remaining unbounded tools"
```

---

### Task 4: Rich Tool Descriptions with Examples and Constraints

**Files:**
- Modify: `src/features/ai-agents/tools/calculate-statistics.ts` (inputSchema descriptions)
- Modify: `src/features/ai-agents/tools/calculate-hhi.ts`
- Modify: `src/features/ai-agents/tools/calculate-correlations.ts`
- Modify: `src/features/ai-agents/tools/decompose-variation.ts`
- Modify: `src/features/ai-agents/tools/execute-sql.ts`
- Modify: `src/features/ai-agents/tools/forecast-timeseries.ts`
- Modify: `src/features/ai-agents/tools/detect-anomalies.ts`

Claude Code 5 has rich `.describe()` on every parameter with valid values, constraints, and usage notes. Our tool descriptions are minimal. This directly impacts how well the LLM chooses and uses tools.

- [ ] **Step 1: Enrich execute-sql description**

In `src/features/ai-agents/tools/execute-sql.ts`, update the description and inputSchema:

```typescript
description:
  'Executa uma query SQL read-only no BigQuery. Retorna até 500 linhas. Use para consultas customizadas que não têm ferramenta dedicada (rankings, segmentações, joins). Filtros de data e projeto já são aplicados pelo agente — inclua-os na query manualmente apenas se precisar de lógica diferente.',
inputSchema: z.object({
  query: z.string().describe(
    'Query SQL SELECT ou WITH (CTE). Apenas leitura — DML/DDL bloqueados. Use backticks para referências: `dataset.tabela`. Tabelas: contratos, pagamentos, fluxo_caixa. Use SAFE_DIVIDE para divisões, FORMAT_DATE para formatar datas, LIMIT para queries exploratórias.'
  ),
}),
```

- [ ] **Step 2: Enrich calculate-statistics description**

```typescript
description:
  'Calcula estatísticas descritivas (média, mediana, percentis p25/p50/p75/p90/p95/p99, desvio padrão, min, max) de uma coluna numérica. Use para perguntas como "como está distribuído o LTV?" ou "qual a média de saldo devedor?". Filtros ativos são aplicados automaticamente.',
inputSchema: z.object({
  column: z.string().describe(
    'Coluna numérica da tabela contratos. Valores válidos: saldo_devedor, saldo_nominal, valor_imovel, ltv, dias_atraso, valor_atraso, valor_over_90, pdd_liquid, pdd_minimo_bacen, delta_pdd, pricing, taxa_juros, prazo_decorrido, prazo_remanescente, private_area. Use APENAS o nome da coluna, sem expressões SQL.'
  ),
  whereClause: z.string().optional().describe(
    'Filtro SQL adicional SEM a palavra WHERE. Ex: "rating_liquid = \'A\'" ou "dias_atraso > 90". Filtros de data/projeto já aplicados automaticamente — use apenas para filtros extras.'
  ),
}),
```

- [ ] **Step 3: Enrich remaining tool descriptions**

Apply the same pattern to `calculate-hhi`, `calculate-correlations`, `decompose-variation`, `forecast-timeseries`, `detect-anomalies`. For each:
- Main `description`: what it does + when to use + what's automatic
- Each parameter `.describe()`: valid values, format, constraints, examples

Key enrichments:

**calculate-hhi:**
```typescript
description: 'Calcula o índice Herfindahl-Hirschman (HHI) de concentração. Use para "qual a concentração por devedor?" ou "existe risco de concentração?". HHI > 2500 = alta concentração, 1500-2500 = moderada, < 1500 = baixa.',
```
- `dimension`: `'Coluna de agrupamento. Valores válidos: documento (por devedor), projeto (por empreendimento), rating_liquid (por rating), faixa_atraso, faixa_ltv, proponent_type, grupos_repasse, safra.'`
- `valueColumn`: `'Coluna numérica para calcular participação. Default: saldo_devedor. Outras opções: saldo_nominal, valor_imovel, pricing.'`

**calculate-correlations:**
```typescript
description: 'Calcula correlação de Pearson e Spearman entre duas variáveis numéricas. Use para "existe correlação entre LTV e atraso?" ou "LTV e saldo estão relacionados?". Retorna força (fraca/moderada/forte) e coeficientes.',
```

**decompose-variation:**
```typescript
description: 'Decompõe a variação de uma métrica entre dois períodos por dimensão, mostrando contribuição de cada grupo. Use para "por que o saldo subiu de jan a mar?" ou "qual rating mais contribuiu para a variação?". Requer dois períodos no formato YYYY-MM.',
```

- [ ] **Step 4: Verify build passes**

Run: `pnpm build`

- [ ] **Step 5: Commit**

```bash
git add src/features/ai-agents/tools/
git commit -m "feat(agents): enrich tool descriptions with examples, valid values, and constraints"
```

---

### Task 5: Tool Selection Guide in Agent Prompts

**Files:**
- Modify: `src/shared/config/agents/descriptive-agent.ts`
- Modify: `src/shared/config/agents/diagnostic-agent.ts`
- Modify: `src/shared/config/agents/predictive-agent.ts`
- Modify: `src/shared/config/agents/simulation-agent.ts`

Agents have multiple tools but no guidance on when to use each. Claude Code 5's system prompts include detailed tool usage guidelines. Adding a tool selection section to the 4 most-used agent prompts.

- [ ] **Step 1: Add tool selection guide to descriptive-agent.ts**

After the "Capacidades" section (line 19), add:

```typescript
## Guia de seleção de ferramentas

- **read_dashboard_state** → Quando o dashboard tem indicadores visíveis e a pergunta pode ser respondida com eles. Use PRIMEIRO.
- **execute_sql** → Queries customizadas: rankings (top N devedores), segmentações (saldo por projeto), dados que nenhuma outra ferramenta fornece. Sempre inclua filtros de data e projeto.
- **calculate_statistics** → Distribuição de UMA coluna numérica (média, mediana, percentis). Use para "como está distribuído o LTV?" ou "estatísticas de saldo devedor".
- **build_vintage_curves** → Evolução de inadimplência por safra de originação. Use para "como estão as safras?" ou "vintage curves".
- **build_transition_matrix** → Migração de rating entre períodos. Use para "como os ratings evoluíram?" ou "matriz de transição".
- **get_table_schema** → Quando não sabe qual coluna usar. Use ANTES de execute_sql se a pergunta for ambígua.
- **get_sample_data** → Para ver exemplos de dados reais. Use quando precisa validar entendimento.
- **lookup_glossary** → Definições de termos ("o que é LTV?", "como funciona PDD?").
```

- [ ] **Step 2: Add tool selection guide to diagnostic-agent.ts**

Read the diagnostic agent prompt file, then add after capabilities:

```typescript
## Guia de seleção de ferramentas

- **calculate_correlations** → Relação entre DUAS variáveis numéricas. Use para "LTV e atraso estão correlacionados?" ou "existe relação entre X e Y?".
- **calculate_hhi** → Concentração da carteira por dimensão. Use para "risco de concentração por devedor?" ou "HHI por projeto".
- **decompose_variation** → Contribuição de cada grupo para uma variação entre períodos. Use para "por que o saldo subiu?" ou "qual rating mais contribuiu?". Requer 2 períodos.
- **run_hypothesis_test** → Diferença estatisticamente significativa entre grupos. Use para "a diferença entre PF e PJ é significativa?".
- **execute_sql** → Queries comparativas que nenhuma outra ferramenta cobre. Último recurso.
```

- [ ] **Step 3: Add tool selection guides to predictive-agent.ts and simulation-agent.ts**

**predictive-agent.ts** — after capabilities:
```typescript
## Guia de seleção de ferramentas

- **forecast_timeseries** → Projeção de série temporal (saldo, inadimplência, contratos). Use para "qual a projeção?" ou "tendência dos próximos meses?". Usa ARIMA_PLUS com fallback para regressão linear.
- **calculate_pd_lgd** → Probabilidade de default e perda. Use para "qual a PD por rating?" ou "LGD estimada".
- **build_survival_curve** → Curva de sobrevivência de contratos. Use para "qual a probabilidade de sobreviver X meses?".
- **generate_early_warnings** → Sinais de deterioração. Use para "quais contratos estão em risco?" ou "early warnings".
- **calculate_cpr_cdr** → Prepagamento e default. Use para "qual o CPR?" ou "taxa de prepagamento".
- **build_vintage_curves** / **build_transition_matrix** → Dados históricos para embasar projeções.
- **execute_sql** → Buscar dados históricos que nenhuma outra ferramenta fornece.
```

**simulation-agent.ts** — after capabilities:
```typescript
## Guia de seleção de ferramentas

- **get_baseline** → SEMPRE use primeiro para obter valores atuais antes de simular. Sem baseline, cenários não têm referência.
- **run_scenario** → Cenários determinísticos ("se inadimplência dobrar, qual o impacto?"). Define parâmetros fixos.
- **run_sensitivity** → Sensibilidade a variações ("como o LTV muda com diferentes limites?"). Varia UM parâmetro.
- **run_monte_carlo** → Distribuição probabilística de resultados. Use para "qual a probabilidade de perda > X?". Mais custoso, use quando precisar de intervalos de confiança.
- **apply_stress_macro** → Stress test com variáveis macroeconômicas (Selic, IPCA). Use para "cenário adverso macro".
- **calculate_stressed_ecl** → ECL sob stress. Use após apply_stress_macro.
- **execute_sql** → Buscar dados adicionais para parametrizar cenários.
```

- [ ] **Step 4: Verify build passes**

Run: `pnpm build`

- [ ] **Step 5: Commit**

```bash
git add src/shared/config/agents/
git commit -m "feat(agents): add tool selection guides to agent system prompts"
```

---

### Task 6: Graceful Degradation Policy and Structured Fallback Status

**Files:**
- Modify: `src/shared/config/agents/shared-context.ts` (RESPONSE_GUIDELINES)
- Modify: `src/features/ai-agents/tools/forecast-timeseries.ts` (add `method` and `warnings` fields)

When tools fail or fall back to simpler methods, the agent doesn't know. Claude Code 5 includes explicit recovery guidance in prompts and structured metadata in tool results.

- [ ] **Step 1: Add graceful degradation policy to RESPONSE_GUIDELINES**

In `src/shared/config/agents/shared-context.ts`, append to the `RESPONSE_GUIDELINES` constant:

```typescript
// After the existing "Esclarecimentos com ask_user" section, add:

## Quando uma ferramenta falha ou retorna dados degradados
- Se a ferramenta retornar \`success: false\`: explique o problema de forma amigável. Sugira simplificar a consulta ou usar filtros diferentes.
- Se \`method\` indicar fallback (ex: LINEAR_REGRESSION_FALLBACK, ZSCORE_IQR_FALLBACK): informe o usuário que o resultado usa um método simplificado e pode ser menos preciso.
- Se \`truncated: true\`: avise que os dados foram truncados e sugira usar filtros mais específicos ou LIMIT.
- Se \`warnings\` contiver mensagens: apresente-as ao usuário antes da análise.
- **NUNCA ignore erros silenciosamente.** Se algo falhou, o usuário precisa saber.
- Se execute_sql falhar com erro de sintaxe: revise a query, simplifique, tente novamente.
```

- [ ] **Step 2: Add `warnings` field to forecast-timeseries return**

In `src/features/ai-agents/tools/forecast-timeseries.ts`, in the ARIMA_PLUS success return, add:
```typescript
warnings: [],
```

In the linear regression fallback return, add:
```typescript
warnings: ['BQML ARIMA_PLUS indisponível neste dataset. Usando regressão linear simples — projeção sem sazonalidade, menos precisa para séries com padrões cíclicos.'],
```

- [ ] **Step 3: Verify build passes**

Run: `pnpm build`

- [ ] **Step 4: Commit**

```bash
git add src/shared/config/agents/shared-context.ts src/features/ai-agents/tools/forecast-timeseries.ts
git commit -m "feat(agents): add graceful degradation policy and structured fallback metadata"
```

---

### Task 7: Canvas query_data Filter Enforcement

**Files:**
- Modify: `src/features/canvas-orchestrator/tools/query-data.ts`
- Modify: `src/features/canvas-orchestrator/orchestrator.ts`

The canvas `query_data` tool accepts raw SQL without access to user filters. The LLM can write queries that ignore the active date range and project filters.

- [ ] **Step 1: Pass filter context to query-data tool**

In `src/features/canvas-orchestrator/orchestrator.ts`, change the `query_data` creation (line 62):

```typescript
// Old:
query_data: createQueryDataTool(input.dataset, input.bqmlEnabled),

// New:
query_data: createQueryDataTool(input.dataset, input.bqmlEnabled, input.filters),
```

- [ ] **Step 2: Add filter validation in query-data.ts**

In `src/features/canvas-orchestrator/tools/query-data.ts`, update the function signature and add validation:

```typescript
import type { ChatRequestFilters } from '@/shared/config/agents/types';

export function createQueryDataTool(dataset: string, bqmlEnabled?: boolean, filters?: ChatRequestFilters) {
  // ... existing patterns ...

  return tool({
    description: bqmlEnabled
      ? 'Executa queries SQL ou BigQuery ML no BigQuery. Suporta SELECT, WITH, CREATE MODEL. IMPORTANTE: sempre filtre por data_base_report e projeto conforme os filtros ativos.'
      : 'Executa uma query SQL read-only no BigQuery. Retorna até 500 rows. IMPORTANTE: sempre filtre por data_base_report e projeto conforme os filtros ativos.',
    inputSchema: z.object({
      sql: z.string().describe(bqmlEnabled
        ? `Query SQL ou BQML. DEVE filtrar por data_base_report${filters ? ` (período ativo: ${filters.dateRange.start} a ${filters.dateRange.end})` : ''}.${filters?.projetos.length ? ` Projetos ativos: ${filters.projetos.join(', ')}.` : ''}`
        : `Query SQL SELECT/WITH. DEVE filtrar por data_base_report${filters ? ` (período ativo: ${filters.dateRange.start} a ${filters.dateRange.end})` : ''}.${filters?.projetos.length ? ` Projetos ativos: ${filters.projetos.join(', ')}.` : ''}`
      ),
      description: z.string().describe('Descrição do que a query busca'),
    }),
    execute: async ({ sql, description }) => {
      // ... existing validation ...

      // Warn if query doesn't reference active filters (soft check, don't block)
      const warnings: string[] = [];
      if (filters?.dateRange && !sql.toLowerCase().includes('data_base_report')) {
        warnings.push(`Aviso: query não filtra por data_base_report. Período ativo: ${filters.dateRange.start} a ${filters.dateRange.end}. Dados podem incluir meses fora do filtro.`);
      }

      // ... existing query execution ...

      return {
        success: true,
        description,
        warnings: warnings.length > 0 ? warnings : undefined,
        // ... rest of existing fields
      };
    },
  });
}
```

- [ ] **Step 3: Verify build passes**

Run: `pnpm build`

- [ ] **Step 4: Commit**

```bash
git add src/features/canvas-orchestrator/tools/query-data.ts src/features/canvas-orchestrator/orchestrator.ts
git commit -m "feat(agents): add filter context and validation to canvas query_data tool"
```

---

### Task 8: Frontend Safety Fixes

**Files:**
- Modify: `src/widgets/ai-sidebar/ui/AISidebar.tsx`

Two targeted fixes: missing advancedFilters in buildBody dependency array, and URL validation in markdown renderer.

- [ ] **Step 1: Fix buildBody dependency array**

In `src/widgets/ai-sidebar/ui/AISidebar.tsx`, find the `buildBody` useCallback dependency array (line 431). Add `JSON.stringify(filterCtx?.advancedFilters)`:

```typescript
// Old (line 431):
}), [activeDataset, filterCtx?.dateRange.start, filterCtx?.dateRange.end, filterCtx?.projetos, filterCtx?.compareEnabled, filterCtx?.viewMode, pathname, focusedIndicator]);

// New:
}), [activeDataset, filterCtx?.dateRange.start, filterCtx?.dateRange.end, filterCtx?.projetos, filterCtx?.compareEnabled, filterCtx?.viewMode, filterCtx?.advancedFilters, pathname, focusedIndicator]);
```

Remove the `eslint-disable-next-line` comment above it (line 430) since the dep array is now correct.

- [ ] **Step 2: Add URL validation in markdown renderer**

In `src/widgets/ai-sidebar/ui/AISidebar.tsx`, in the `MarkdownContent` component, add an `a` override to the `components` prop of ReactMarkdown. Find where the existing components are defined (around line 60-80) and add:

```typescript
a: ({ href, children }) => {
  const isSafe = href && (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('/'));
  if (!isSafe) return <span className="text-white/60">{children}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">
      {children}
    </a>
  );
},
```

- [ ] **Step 3: Verify build passes**

Run: `pnpm build`

- [ ] **Step 4: Commit**

```bash
git add src/widgets/ai-sidebar/ui/AISidebar.tsx
git commit -m "fix(ui): add advancedFilters to buildBody deps and sanitize markdown URLs"
```

---

## File Map Summary

| File | Action | Task(s) |
|------|--------|---------|
| `src/features/ai-agents/lib/column-validator.ts` | Create | 1 |
| `src/features/ai-agents/lib/format-error.ts` | Create | 2 |
| `src/features/ai-agents/lib/truncate-result.ts` | Create | 3 |
| `src/features/ai-agents/tools/bqml-utils.ts` | Modify | 1 |
| `src/features/ai-agents/tools/calculate-statistics.ts` | Modify | 1, 2, 4 |
| `src/features/ai-agents/tools/calculate-hhi.ts` | Modify | 1, 2, 4 |
| `src/features/ai-agents/tools/calculate-correlations.ts` | Modify | 1, 2, 4 |
| `src/features/ai-agents/tools/decompose-variation.ts` | Modify | 1, 2, 4 |
| `src/features/ai-agents/tools/detect-anomalies.ts` | Modify | 1, 2, 3, 4 |
| `src/features/ai-agents/tools/forecast-timeseries.ts` | Modify | 1, 2, 4, 6 |
| `src/features/ai-agents/tools/execute-sql.ts` | Modify | 2, 4 |
| `src/features/canvas-orchestrator/tools/query-data.ts` | Modify | 2, 3, 7 |
| `src/features/canvas-orchestrator/tools/get-filter-options.ts` | Modify | 3 |
| `src/features/canvas-orchestrator/orchestrator.ts` | Modify | 7 |
| `src/shared/config/agents/shared-context.ts` | Modify | 6 |
| `src/shared/config/agents/descriptive-agent.ts` | Modify | 5 |
| `src/shared/config/agents/diagnostic-agent.ts` | Modify | 5 |
| `src/shared/config/agents/predictive-agent.ts` | Modify | 5 |
| `src/shared/config/agents/simulation-agent.ts` | Modify | 5 |
| `src/widgets/ai-sidebar/ui/AISidebar.tsx` | Modify | 8 |

**Execution order note:** Tasks 1-3 create shared utilities used by later tasks. Task 4 modifies the same files as Tasks 1-2 (tool descriptions). Recommended execution: Tasks 1→2→3→4→5→6→7→8 sequentially.
