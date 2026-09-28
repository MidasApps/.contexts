# Explore: Skeleton-Driven Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the /explore canvas orchestrator declare layouts with skeleton placeholders upfront, then fill blocks in parallel via sub-agents.

**Architecture:** New `declare_layout` tool emits typed skeletons to the canvas store immediately. New `fill_block` async generator tool delegates to specialized sub-agents (reusing existing agent infrastructure from `analyze.ts`) in parallel. A new `SkeletonBlock` type in the `CanvasBlock` union enables type-safe placeholder rendering.

**Tech Stack:** Vercel AI SDK (streamText, tool, generateText), Zustand, React, Zod, existing agent tools

**Spec:** `docs/superpowers/specs/2026-04-02-explore-skeleton-driven-layout-design.md`

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `src/features/canvas-orchestrator/lib/sub-agent.ts` | Shared sub-agent infrastructure (extracted from analyze.ts) |
| `src/features/canvas-orchestrator/tools/declare-layout.ts` | `declare_layout` tool definition |
| `src/features/canvas-orchestrator/tools/fill-block.ts` | `fill_block` async generator tool |
| `src/features/canvas-orchestrator/tools/submit-block-data.ts` | `submit_*_data` passthrough tools for sub-agents |
| `src/features/canvas-orchestrator/tools/adapt-layout.ts` | `add_slot` and `remove_slot` tools |
| `src/pages/explore/ui/blocks/BlockError.tsx` | Error state component for failed slots |

### Modified Files
| File | Change |
|------|--------|
| `src/shared/config/agents/types.ts:87-151` | Add `SkeletonBlock` to `CanvasBlock` union |
| `src/shared/stores/canvas-store.ts:17-46` | Add `replaceBlock` and `updateSlotStatus` to store interface + implementation |
| `src/pages/explore/ui/blocks/BlockSkeleton.tsx` | Add `label`, `isLoading` props + `kpi` singular case |
| `src/pages/explore/ui/CanvasBlockRenderer.tsx` | Add `skeleton` case routing to BlockSkeleton/BlockError |
| `src/features/canvas-orchestrator/tools/analyze.ts` | Extract shared code to `lib/sub-agent.ts`, import from there |
| `src/features/canvas-orchestrator/orchestrator.ts:51-69` | Register new tools |
| `src/pages/explore/ui/CanvasChat.tsx:21-44,227-284` | Add handlers for new tool results + dedup fix |
| `src/shared/config/agents/canvas-orchestrator.ts` | Add skeleton-driven flow instructions to prompt |

---

### Task 1: Add `SkeletonBlock` type to `CanvasBlock` union

**Files:**
- Modify: `src/shared/config/agents/types.ts:87-151`

- [ ] **Step 1: Add SkeletonBlock interface and update union**

In `src/shared/config/agents/types.ts`, after the `TableBlock` interface (line 149) and before the `CanvasBlock` type (line 151):

```typescript
export interface SkeletonBlock extends BaseBlock {
  type: 'skeleton';
  /** Which block type to render as skeleton shape */
  targetType: 'kpi' | 'chart' | 'table' | 'text';
  /** Label displayed on the skeleton placeholder */
  slotLabel: string;
  /** Current loading status */
  slotStatus: 'pending' | 'loading' | 'error';
  /** Error message when slotStatus is 'error' */
  slotError?: string;
}
```

Update the `CanvasBlock` union (line 151) to include `SkeletonBlock`:

```typescript
export type CanvasBlock = TextBlock | KpiBlock | SingleKpiBlock | ChartBlock | TableBlock | SkeletonBlock;
```

- [ ] **Step 2: Verify build compiles**

Run: `pnpm build 2>&1 | head -30`
Expected: No type errors related to CanvasBlock (there may be exhaustiveness warnings in switch statements — that's expected and will be fixed in Task 5).

- [ ] **Step 3: Commit**

```bash
git add src/shared/config/agents/types.ts
git commit -m "feat(types): add SkeletonBlock to CanvasBlock union"
```

---

### Task 2: Add `replaceBlock` and `updateSlotStatus` to canvas store

**Files:**
- Modify: `src/shared/stores/canvas-store.ts:6-46,173-187`

- [ ] **Step 1: Add `skeleton` to MIN_SLOTS map**

At `canvas-store.ts:6-11`, add skeleton entry:

```typescript
const MIN_SLOTS: Record<string, number> = {
  table: 2,
  kpis: 2,
  chart: 1,
  text: 1,
  skeleton: 1,
};
```

- [ ] **Step 2: Add method signatures to CanvasStore interface**

At `canvas-store.ts`, after `updateBlockContent` (line 31), add:

```typescript
  replaceBlock: (pageIndex: number, slotId: string, block: CanvasBlock) => void;
  updateSlotStatus: (pageIndex: number, slotId: string, status: 'pending' | 'loading' | 'error', error?: string) => void;
```

- [ ] **Step 3: Implement `replaceBlock`**

After the `updateBlockContent` implementation (after line 187), add:

```typescript
  replaceBlock: (pageIndex, slotId, block) => {
    set((state) => {
      const page = state.pages[pageIndex];
      if (!page || !page.blockMap[slotId]) return state;
      const existing = page.blockMap[slotId];
      // Preserve colSpan from the skeleton if the new block doesn't specify one
      const colSpan = block.colSpan ?? existing.colSpan;
      const pages = [...state.pages];
      pages[pageIndex] = {
        ...page,
        blockMap: { ...page.blockMap, [slotId]: { ...block, id: slotId, colSpan } },
      };
      return { pages };
    });
  },
```

- [ ] **Step 4: Implement `updateSlotStatus`**

After `replaceBlock`, add:

```typescript
  updateSlotStatus: (pageIndex, slotId, status, error) => {
    set((state) => {
      const page = state.pages[pageIndex];
      if (!page || !page.blockMap[slotId]) return state;
      const existing = page.blockMap[slotId];
      if (existing.type !== 'skeleton') return state;
      const pages = [...state.pages];
      const updated: CanvasBlock = { ...existing, slotStatus: status, slotError: error };
      pages[pageIndex] = {
        ...page,
        blockMap: { ...page.blockMap, [slotId]: updated },
      };
      return { pages };
    });
  },
```

Note: import `CanvasBlock` is already imported at line 2. The `SkeletonBlock` type check (`existing.type !== 'skeleton'`) ensures we only update skeleton blocks.

- [ ] **Step 5: Verify build compiles**

Run: `pnpm build 2>&1 | head -30`
Expected: Clean compile or only unrelated warnings.

- [ ] **Step 6: Commit**

```bash
git add src/shared/stores/canvas-store.ts
git commit -m "feat(canvas-store): add replaceBlock and updateSlotStatus methods"
```

---

### Task 3: Update `BlockSkeleton` and create `BlockError`

**Files:**
- Modify: `src/pages/explore/ui/blocks/BlockSkeleton.tsx`
- Create: `src/pages/explore/ui/blocks/BlockError.tsx`

- [ ] **Step 1: Rewrite BlockSkeleton with new props**

Replace the entire content of `src/pages/explore/ui/blocks/BlockSkeleton.tsx`:

```typescript
'use client';

import { Skeleton } from '@/shared/ui/skeleton';
import { cn } from '@/shared/lib/utils';

interface BlockSkeletonProps {
  type?: string;
  label?: string;
  isLoading?: boolean;
}

export function BlockSkeleton({ type, label, isLoading = false }: BlockSkeletonProps) {
  const pulse = isLoading ? 'animate-pulse' : '';

  switch (type) {
    case 'kpi':
      return (
        <div className="space-y-2 rounded-xl border border-white/[0.06] p-4">
          {label && <p className="text-[10px] text-white/25 uppercase tracking-wider">{label}</p>}
          <Skeleton className={cn('h-7 w-24 bg-white/[0.06]', pulse)} />
          <Skeleton className={cn('h-4 w-16 bg-white/[0.06]', pulse)} />
          <Skeleton className={cn('h-10 w-full bg-white/[0.06]', pulse)} />
        </div>
      );
    case 'kpis':
      return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2 rounded-xl border border-white/[0.06] p-4">
              <Skeleton className={cn('h-3 w-16 bg-white/[0.06]', pulse)} />
              <Skeleton className={cn('h-7 w-24 bg-white/[0.06]', pulse)} />
              <Skeleton className={cn('h-6 w-full bg-white/[0.06]', pulse)} />
            </div>
          ))}
        </div>
      );
    case 'chart':
      return (
        <div className="space-y-3">
          {label
            ? <p className="text-[11px] text-white/30 font-medium">{label}</p>
            : <Skeleton className={cn('h-4 w-40 bg-white/[0.06]', pulse)} />
          }
          <Skeleton className={cn('h-[300px] w-full rounded-xl bg-white/[0.06]', pulse)} />
        </div>
      );
    case 'table':
      return (
        <div className="space-y-2">
          {label && <p className="text-[11px] text-white/30 font-medium">{label}</p>}
          <Skeleton className={cn('h-8 w-full rounded bg-white/[0.06]', pulse)} />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className={cn('h-10 w-full rounded bg-white/[0.06]', pulse)} />
          ))}
        </div>
      );
    default:
      return (
        <div className="space-y-2">
          {label && <p className="text-[11px] text-white/30 font-medium">{label}</p>}
          <Skeleton className={cn('h-4 w-3/4 bg-white/[0.06]', pulse)} />
          <Skeleton className={cn('h-4 w-1/2 bg-white/[0.06]', pulse)} />
          <Skeleton className={cn('h-4 w-2/3 bg-white/[0.06]', pulse)} />
        </div>
      );
  }
}
```

- [ ] **Step 2: Create BlockError component**

Create `src/pages/explore/ui/blocks/BlockError.tsx`:

```typescript
'use client';

import { AlertTriangle } from 'lucide-react';

interface BlockErrorProps {
  label?: string;
  error?: string;
}

export function BlockError({ label, error }: BlockErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-red-500/15 bg-red-500/5 p-6 text-center">
      <AlertTriangle className="h-5 w-5 text-red-400/60" strokeWidth={1.5} />
      {label && (
        <p className="text-[11px] font-medium text-white/50">{label}</p>
      )}
      <p className="text-[11px] text-red-400/50">
        {error ?? 'Erro ao carregar dados'}
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `pnpm build 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add src/pages/explore/ui/blocks/BlockSkeleton.tsx src/pages/explore/ui/blocks/BlockError.tsx
git commit -m "feat(explore): update BlockSkeleton with label/isLoading, add BlockError"
```

---

### Task 4: Update `CanvasBlockRenderer` for skeleton routing

**Files:**
- Modify: `src/pages/explore/ui/CanvasBlockRenderer.tsx`

- [ ] **Step 1: Add skeleton case to renderer**

Replace the entire content of `src/pages/explore/ui/CanvasBlockRenderer.tsx`:

```typescript
'use client';

import type { CanvasBlock } from '@/shared/config/agents/types';
import { TextBlock } from './blocks/TextBlock';
import { KpiBlock } from './blocks/KpiBlock';
import { SingleKpiBlock } from './blocks/SingleKpiBlock';
import { ChartBlock } from './blocks/ChartBlock';
import { TableBlock } from './blocks/TableBlock';
import { BlockSkeleton } from './blocks/BlockSkeleton';
import { BlockError } from './blocks/BlockError';
import { ChartWidget } from '@/widgets/chart-widget/ui/ChartWidget';

export function CanvasBlockRenderer({ block }: { block: CanvasBlock }) {
  if (block.type === 'skeleton') {
    if (block.slotStatus === 'error') {
      return <BlockError label={block.slotLabel} error={block.slotError} />;
    }
    return (
      <BlockSkeleton
        type={block.targetType}
        label={block.slotLabel}
        isLoading={block.slotStatus === 'loading'}
      />
    );
  }

  switch (block.type) {
    case 'text':
      return <TextBlock block={block} />;
    case 'kpi':
      return <SingleKpiBlock block={block} />;
    case 'kpis':
      return <KpiBlock block={block} />;
    case 'chart':
      return (
        <ChartWidget
          title={block.title ?? ''}
          height={340}
          expandable={false}
        >
          <ChartBlock block={block} />
        </ChartWidget>
      );
    case 'table':
      return <TableBlock block={block} />;
    default:
      return null;
  }
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build 2>&1 | head -30`

- [ ] **Step 3: Commit**

```bash
git add src/pages/explore/ui/CanvasBlockRenderer.tsx
git commit -m "feat(explore): add skeleton/error routing to CanvasBlockRenderer"
```

---

### Task 5: Extract shared sub-agent infrastructure from `analyze.ts`

**Files:**
- Create: `src/features/canvas-orchestrator/lib/sub-agent.ts`
- Modify: `src/features/canvas-orchestrator/tools/analyze.ts`

- [ ] **Step 1: Create `lib/sub-agent.ts`**

Extract from `analyze.ts` the following into `src/features/canvas-orchestrator/lib/sub-agent.ts`:
- All import statements for agent tools (lines 6-68)
- `AGENT_TYPE` z.enum (line 70-79)
- `AgentType` type (line 81)
- `PROMPT_BUILDERS` record (lines 83-92)
- `validateDataset` function (lines 96-99)
- `buildProjetoFilter` function (lines 101-105)
- `buildAdvancedFilters` function (lines 107-122)
- `toLastDayOfMonth` function (lines 124-128)
- `buildGetBaselineTool` function (lines 130-177)
- `askUserTool` (lines 180-190)
- `searchGlossary` function (lines 192-201)
- `buildToolsForAgent` function (lines 203-331)

Export: `AGENT_TYPE`, `AgentType`, `PROMPT_BUILDERS`, `buildToolsForAgent`, `askUserTool`, `buildGetBaselineTool`

The file will be large (~330 lines) but it's a clean extraction — all these functions are cohesive (they build the sub-agent execution environment).

- [ ] **Step 2: Update `analyze.ts` to import from `lib/sub-agent.ts`**

Replace the bulk of `analyze.ts` with imports from the new module. The file should shrink to ~40 lines:

```typescript
import { tool, generateText, stepCountIs } from 'ai';
import { z } from 'zod';
import { getModel } from '@/features/ai-agents/model-registry';
import { formatToolError } from '@/features/ai-agents/lib/format-error';
import type { AgentDynamicContext } from '@/shared/config/agents/types';
import type { ToolContext } from '@/features/ai-agents/tools/tool-context';
import { AGENT_TYPE, PROMPT_BUILDERS, buildToolsForAgent } from '../lib/sub-agent';

export function createAnalyzeTool(ctx: AgentDynamicContext) {
  return tool({
    description:
      'Delega uma análise especializada a um sub-agente (descriptive, diagnostic, predictive, simulation, prescriptive, monitoring, cashflow, external). Retorna texto com a análise.',
    inputSchema: z.object({
      agentType: AGENT_TYPE.describe('Tipo do agente especializado a invocar'),
      query: z.string().describe('A pergunta ou instrução para o agente'),
    }),
    execute: async ({ agentType, query }) => {
      const buildPrompt = PROMPT_BUILDERS[agentType];
      const system = buildPrompt(ctx);
      const toolCtx: ToolContext = { dataset: ctx.dataset, filters: ctx.filters, sessionId: ctx.sessionId };
      const tools = buildToolsForAgent(agentType, toolCtx, ctx);

      try {
        const result = await generateText({
          model: getModel('fast'),
          system,
          prompt: query,
          tools,
          stopWhen: stepCountIs(8),
        });

        return {
          success: true,
          agentType,
          text: result.text,
          toolCalls: result.steps.flatMap(s => s.toolCalls.map(tc => tc.toolName)),
        };
      } catch (error) {
        return {
          success: false,
          agentType,
          error: formatToolError(error),
        };
      }
    },
  });
}
```

- [ ] **Step 3: Verify build**

Run: `pnpm build 2>&1 | head -30`
Expected: Clean compile. The `analyze` tool should work identically.

- [ ] **Step 4: Commit**

```bash
git add src/features/canvas-orchestrator/lib/sub-agent.ts src/features/canvas-orchestrator/tools/analyze.ts
git commit -m "refactor(canvas): extract shared sub-agent infrastructure to lib/sub-agent.ts"
```

---

### Task 6: Create `submit_*_data` passthrough tools

**Files:**
- Create: `src/features/canvas-orchestrator/tools/submit-block-data.ts`

- [ ] **Step 1: Create submit block data tools**

Create `src/features/canvas-orchestrator/tools/submit-block-data.ts`:

```typescript
import { tool } from 'ai';
import { z } from 'zod';

export const submitKpiDataTool = tool({
  description: 'Entrega os dados de um KPI individual. Chame esta tool quando tiver todos os dados calculados.',
  inputSchema: z.object({
    label: z.string().describe('Nome do indicador'),
    value: z.string().describe('Valor formatado (ex: "R$ 245,3M")'),
    description: z.string().optional().describe('Descrição do que o indicador representa'),
    trend: z.string().optional().describe('Variação percentual (ex: "+2,3%")'),
    trendDirection: z.enum(['up', 'down']).optional(),
    trendIsPositive: z.boolean().optional().describe('Se a direção é positiva para o negócio'),
    sparklineData: z.array(z.number().nullable()).optional().describe('Array de ~10 valores mensais para mini-gráfico'),
    sparklineMonths: z.array(z.string()).optional().describe('Array de meses "YYYY-MM" correspondentes'),
    previousValue: z.string().optional().describe('Valor do período anterior formatado'),
    deltaPercent: z.string().optional().describe('Delta percentual (ex: "+9,1%")'),
  }),
  execute: async (input) => input,
});

export const submitChartDataTool = tool({
  description: 'Entrega os dados de um gráfico. Chame esta tool quando tiver todos os dados calculados.',
  inputSchema: z.object({
    chartType: z.enum(['bar', 'line', 'area', 'composed', 'stacked-bar']),
    title: z.string().optional(),
    xAxisKey: z.string().describe('Chave do eixo X nos objetos de data'),
    dataKeys: z.array(z.string()).describe('Chaves dos valores a plotar'),
    data: z.array(z.record(z.union([z.string(), z.number()]))).describe('Array de objetos com os dados'),
    colors: z.array(z.string()).optional(),
    stacked: z.boolean().optional(),
  }),
  execute: async (input) => input,
});

export const submitTableDataTool = tool({
  description: 'Entrega os dados de uma tabela. Chame esta tool quando tiver todos os dados calculados.',
  inputSchema: z.object({
    title: z.string().optional(),
    columns: z.array(z.object({
      header: z.string(),
      accessorKey: z.string(),
      format: z.enum(['currency', 'percent', 'number', 'date']).optional(),
    })),
    rows: z.array(z.record(z.unknown())).describe('Dados das linhas (máx 100)'),
  }),
  execute: async (input) => input,
});

export const submitTextDataTool = tool({
  description: 'Entrega o conteúdo de um bloco de texto. Chame esta tool quando tiver o texto pronto.',
  inputSchema: z.object({
    content: z.string().describe('Conteúdo em markdown'),
  }),
  execute: async (input) => input,
});

/** Map target block type → submit tool */
export const SUBMIT_TOOLS = {
  kpi: { submit_data: submitKpiDataTool },
  chart: { submit_data: submitChartDataTool },
  table: { submit_data: submitTableDataTool },
  text: { submit_data: submitTextDataTool },
} as const;
```

Note: All submit tools use the same name `submit_data` — the sub-agent only sees one. Which tool is injected depends on `targetType`.

- [ ] **Step 2: Verify build**

Run: `pnpm build 2>&1 | head -30`

- [ ] **Step 3: Commit**

```bash
git add src/features/canvas-orchestrator/tools/submit-block-data.ts
git commit -m "feat(canvas): add submit_*_data passthrough tools for sub-agents"
```

---

### Task 7: Create `declare_layout` tool

**Files:**
- Create: `src/features/canvas-orchestrator/tools/declare-layout.ts`

- [ ] **Step 1: Create declare-layout tool**

Create `src/features/canvas-orchestrator/tools/declare-layout.ts`:

```typescript
import { tool } from 'ai';
import { z } from 'zod';

export const DEFAULT_COL_SPANS: Record<string, 1 | 2 | 3> = {
  kpi: 1,
  chart: 2,
  table: 3,
  text: 2,
};

export function createDeclareLayoutTool(existingPageCount: number) {
  let nextPageIndex = existingPageCount;
  return tool({
    description:
      'Declara o layout completo de uma nova página com placeholders. O usuário verá skeletons imediatamente. Chame ANTES de fill_block.',
    inputSchema: z.object({
      pageTitle: z.string().describe('Título da página'),
      pageDescription: z.string().optional().describe('Descrição curta da análise'),
      blocks: z.array(z.object({
        slotId: z.string().describe('ID único estável para referenciar este slot'),
        type: z.enum(['kpi', 'chart', 'table', 'text']).describe('Tipo do bloco'),
        label: z.string().describe('Label exibido no placeholder'),
        colSpan: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional()
          .describe('Largura: 1=1/3, 2=2/3, 3=full. Default: kpi=1, chart=2, table=3, text=2'),
      })).describe('Lista de blocos a criar'),
      filters: z.object({
        dateRange: z.object({ start: z.string(), end: z.string() }).optional(),
        projetos: z.array(z.string()).optional(),
      }).optional().describe('Filtros específicos desta página (se diferente dos globais)'),
    }),
    execute: async ({ pageTitle, pageDescription, blocks, filters }) => {
      const pageIndex = nextPageIndex++;
      return {
        action: 'declare_layout' as const,
        pageIndex,
        pageTitle,
        pageDescription,
        blocks: blocks.map((b) => ({
          ...b,
          colSpan: b.colSpan ?? DEFAULT_COL_SPANS[b.type] ?? 1,
        })),
        filters,
      };
    },
  });
}

export { DEFAULT_COL_SPANS };
```

- [ ] **Step 2: Verify build**

Run: `pnpm build 2>&1 | head -30`

- [ ] **Step 3: Commit**

```bash
git add src/features/canvas-orchestrator/tools/declare-layout.ts
git commit -m "feat(canvas): add declare_layout tool for skeleton-driven pages"
```

---

### Task 8: Create `fill_block` async generator tool

**Files:**
- Create: `src/features/canvas-orchestrator/tools/fill-block.ts`

- [ ] **Step 1: Create fill-block tool**

Create `src/features/canvas-orchestrator/tools/fill-block.ts`:

```typescript
import { tool, generateText, stepCountIs } from 'ai';
import { z } from 'zod';
import { getModel } from '@/features/ai-agents/model-registry';
import { formatToolError } from '@/features/ai-agents/lib/format-error';
import { withRetry } from '@/features/ai-agents/lib/with-retry';
import type { AgentDynamicContext, SingleKpiBlock, ChartBlock, TableBlock, TextBlock } from '@/shared/config/agents/types';
import type { ToolContext } from '@/features/ai-agents/tools/tool-context';
import { AGENT_TYPE, PROMPT_BUILDERS, buildToolsForAgent } from '../lib/sub-agent';
import { SUBMIT_TOOLS } from './submit-block-data';

const TARGET_TYPE = z.enum(['kpi', 'chart', 'table', 'text']);
type TargetType = z.infer<typeof TARGET_TYPE>;

function buildFillPrompt(targetType: TargetType, intent: string, ctx: AgentDynamicContext): string {
  const af = ctx.filters.advancedFilters;
  const filterCtx = [
    `Dataset: ${ctx.dataset}`,
    `Período: ${ctx.filters.dateRange.start} a ${ctx.filters.dateRange.end}`,
    ctx.filters.projetos.length > 0 ? `Projetos: ${ctx.filters.projetos.join(', ')}` : '',
    ctx.filters.viewMode === 'accumulated' ? 'Modo: Acumulado' : 'Modo: Snapshot (último mês)',
    af?.ratings?.length ? `Ratings: ${af.ratings.join(', ')}` : '',
    af?.faixaAtraso?.length ? `Faixa atraso: ${af.faixaAtraso.join(', ')}` : '',
  ].filter(Boolean).join('\n');

  return `Você está preenchendo um bloco de tipo "${targetType}" para um dashboard de análise de crédito securitizado.

## Filtros ativos
${filterCtx}

## Sua tarefa
${intent}

## Regras
- Execute as queries e cálculos necessários para obter os dados
- Ao final, OBRIGATORIAMENTE chame a tool \`submit_data\` com os dados estruturados
- Para KPIs: SEMPRE inclua sparklineData (últimos 10 meses) e todos os campos de trend
- Para charts: retorne data[], dataKeys[], xAxisKey, chartType adequado
- Para tables: retorne columns[] e rows[] (máx 100 linhas)
- Para text: retorne content em markdown
- NÃO retorne explicações textuais — apenas chame submit_data com os dados
- Valores monetários em formato brasileiro (R$ X.XXX,XX)
- Percentuais com vírgula decimal
- Datas no eixo X como "YYYY-MM"`;
}

function convertToBlock(targetType: TargetType, slotId: string, data: Record<string, unknown>): SingleKpiBlock | ChartBlock | TableBlock | TextBlock {
  switch (targetType) {
    case 'kpi':
      return {
        id: slotId,
        type: 'kpi',
        label: data.label as string ?? '',
        value: data.value as string ?? '',
        description: data.description as string | undefined,
        trend: data.trend as string | undefined,
        trendDirection: data.trendDirection as 'up' | 'down' | undefined,
        trendIsPositive: data.trendIsPositive as boolean | undefined,
        sparklineData: data.sparklineData as number[] | undefined,
        sparklineMonths: data.sparklineMonths as string[] | undefined,
        previousValue: data.previousValue as string | undefined,
        deltaPercent: data.deltaPercent as string | undefined,
      };
    case 'chart':
      return {
        id: slotId,
        type: 'chart',
        chartType: (data.chartType as ChartBlock['chartType']) ?? 'bar',
        title: data.title as string | undefined,
        xAxisKey: data.xAxisKey as string ?? '',
        dataKeys: data.dataKeys as string[] ?? [],
        data: data.data as Array<Record<string, string | number>> ?? [],
        colors: data.colors as string[] | undefined,
        stacked: data.stacked as boolean | undefined,
      };
    case 'table':
      return {
        id: slotId,
        type: 'table',
        title: data.title as string | undefined,
        columns: data.columns as TableBlock['columns'] ?? [],
        rows: (data.rows as Record<string, unknown>[])?.slice(0, 100) ?? [],
      };
    case 'text':
      return {
        id: slotId,
        type: 'text',
        content: data.content as string ?? '',
      };
  }
}

export function createFillBlockTool(ctx: AgentDynamicContext) {
  return tool({
    description:
      'Preenche um slot declarado com dados reais delegando a um sub-agente especializado. Chame em paralelo para múltiplos slots.',
    inputSchema: z.object({
      slotId: z.string().describe('ID do slot declarado em declare_layout'),
      pageIndex: z.number().describe('Índice da página do slot'),
      targetType: TARGET_TYPE.describe('Tipo do bloco a preencher'),
      intent: z.string().describe('Descrição detalhada do que calcular/consultar para este bloco'),
      agentType: AGENT_TYPE.describe('Tipo do sub-agente especializado'),
    }),
    async *execute({ slotId, pageIndex, targetType, intent, agentType }) {
      // Signal loading state
      yield { status: 'loading' as const, slotId, pageIndex };

      const buildPrompt = PROMPT_BUILDERS[agentType];
      const agentSystemPrompt = buildPrompt(ctx);
      const fillPrompt = buildFillPrompt(targetType, intent, ctx);
      const system = `${agentSystemPrompt}\n\n---\n\n${fillPrompt}`;

      const toolCtx: ToolContext = { dataset: ctx.dataset, filters: ctx.filters, sessionId: ctx.sessionId };
      const agentTools = buildToolsForAgent(agentType, toolCtx, ctx);
      const submitTools = SUBMIT_TOOLS[targetType];

      try {
        const result = await withRetry(
          () => generateText({
            model: getModel('fast'),
            system,
            prompt: intent,
            tools: { ...agentTools, ...submitTools },
            stopWhen: stepCountIs(8),
            abortSignal: AbortSignal.timeout(30_000),
          }),
          { label: `fill_block:${slotId}` },
        );

        // Find submit_data tool result
        const submitResult = result.steps
          .flatMap(s => s.toolResults)
          .find(tr => tr.toolName === 'submit_data');

        if (submitResult?.output && typeof submitResult.output === 'object') {
          const block = convertToBlock(targetType, slotId, submitResult.output as Record<string, unknown>);
          yield { status: 'ready' as const, slotId, pageIndex, block };
        } else {
          // Sub-agent didn't call submit_data — try to extract from text
          yield {
            status: 'error' as const,
            slotId,
            pageIndex,
            error: 'Sub-agente não retornou dados estruturados',
          };
        }
      } catch (error) {
        console.error(`[fill_block:${slotId}]`, error);
        yield {
          status: 'error' as const,
          slotId,
          pageIndex,
          error: error instanceof Error ? error.message : 'Erro desconhecido',
        };
      }
    },
  });
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build 2>&1 | head -30`

- [ ] **Step 3: Commit**

```bash
git add src/features/canvas-orchestrator/tools/fill-block.ts
git commit -m "feat(canvas): add fill_block async generator tool with sub-agent delegation"
```

---

### Task 9: Create `add_slot` and `remove_slot` tools

**Files:**
- Create: `src/features/canvas-orchestrator/tools/adapt-layout.ts`

- [ ] **Step 1: Create adapt-layout tools**

Create `src/features/canvas-orchestrator/tools/adapt-layout.ts`:

```typescript
import { tool } from 'ai';
import { z } from 'zod';
import { DEFAULT_COL_SPANS } from './declare-layout';

export function createAddSlotTool() {
  return tool({
    description:
      'Adiciona um slot extra ao layout (não previsto no declare_layout original). O usuário verá um novo skeleton. Chame fill_block depois.',
    inputSchema: z.object({
      pageIndex: z.number().describe('Índice da página'),
      slotId: z.string().describe('ID único para o novo slot'),
      type: z.enum(['kpi', 'chart', 'table', 'text']).describe('Tipo do bloco'),
      label: z.string().describe('Label do placeholder'),
      colSpan: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
      position: z.number().optional().describe('Posição no layout (default: final)'),
    }),
    execute: async ({ pageIndex, slotId, type, label, colSpan, position }) => ({
      action: 'add_slot' as const,
      pageIndex,
      slotId,
      type,
      label,
      colSpan: colSpan ?? DEFAULT_COL_SPANS[type] ?? 1,
      position,
    }),
  });
}

export function createRemoveSlotTool() {
  return tool({
    description: 'Remove um slot do layout (skeleton ou bloco preenchido).',
    inputSchema: z.object({
      pageIndex: z.number().describe('Índice da página'),
      slotId: z.string().describe('ID do slot a remover'),
      reason: z.string().optional().describe('Motivo da remoção (para log)'),
    }),
    execute: async ({ pageIndex, slotId, reason }) => ({
      action: 'remove_slot' as const,
      pageIndex,
      slotId,
      reason,
    }),
  });
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build 2>&1 | head -30`

- [ ] **Step 3: Commit**

```bash
git add src/features/canvas-orchestrator/tools/adapt-layout.ts
git commit -m "feat(canvas): add add_slot and remove_slot adaptation tools"
```

---

### Task 10: Register new tools in orchestrator

**Files:**
- Modify: `src/features/canvas-orchestrator/orchestrator.ts`

- [ ] **Step 1: Add imports and register tools**

Add imports at the top of `orchestrator.ts` (after line 15):

```typescript
import { createDeclareLayoutTool } from './tools/declare-layout';
import { createFillBlockTool } from './tools/fill-block';
import { createAddSlotTool, createRemoveSlotTool } from './tools/adapt-layout';
```

Add the new tools to the `tools` object inside `streamText` (after line 69, before the closing `}`):

```typescript
      declare_layout: createDeclareLayoutTool(input.pagesContext.length),
      fill_block: createFillBlockTool(ctx),
      add_slot: createAddSlotTool(),
      remove_slot: createRemoveSlotTool(),
```

- [ ] **Step 2: Verify build**

Run: `pnpm build 2>&1 | head -30`

- [ ] **Step 3: Commit**

```bash
git add src/features/canvas-orchestrator/orchestrator.ts
git commit -m "feat(canvas): register skeleton-driven tools in orchestrator"
```

---

### Task 11: Update `CanvasChat.tsx` with new tool handlers

**Files:**
- Modify: `src/pages/explore/ui/CanvasChat.tsx:21-44,227-284`

- [ ] **Step 1: Add TOOL_LABELS for new tools**

At `CanvasChat.tsx`, add to the `TOOL_LABELS` map (after line 43):

```typescript
  declare_layout: 'Planejando layout',
  fill_block: 'Preenchendo bloco',
  add_slot: 'Adicionando bloco',
  remove_slot: 'Removendo bloco',
```

- [ ] **Step 2: Add SkeletonBlock import**

At the top of `CanvasChat.tsx`, update the import from types:

```typescript
import type { SkeletonBlock } from '@/shared/config/agents/types';
```

- [ ] **Step 3: Import DEFAULT_COL_SPANS**

At the top of `CanvasChat.tsx`, add import:

```typescript
import { DEFAULT_COL_SPANS } from '@/features/canvas-orchestrator/tools/declare-layout';
```

- [ ] **Step 4: Fix dedup logic for async generator yields**

In the tool processing effect (around line 239), change the dedup key logic. Replace:

```typescript
        if (processedToolCalls.current.has(toolPart.toolCallId)) continue;
```

With:

```typescript
        // For fill_block (async generator), use composite key to allow multiple yields
        const dedupKey = toolName === 'fill_block'
          ? `${toolPart.toolCallId}:${(result as Record<string, unknown>)?.status ?? 'final'}`
          : toolPart.toolCallId!;
        if (processedToolCalls.current.has(dedupKey)) continue;
```

And change the line that adds to the set from:

```typescript
        processedToolCalls.current.add(toolPart.toolCallId);
```

To:

```typescript
        processedToolCalls.current.add(dedupKey);
```

- [ ] **Step 5: Add handlers for new tools**

After the existing `set_filters` handler (around line 280), add the new handlers:

```typescript
        // declare_layout → create page + add skeleton blocks
        if (toolName === 'declare_layout') {
          const output = result as Record<string, unknown>;
          const serverPageIndex = output.pageIndex as number;
          const storePageIndex = canvasStore.getState().createPage(
            output.pageTitle as string,
            output.pageDescription as string | undefined,
          );
          pageIndexMap.current.set(serverPageIndex, storePageIndex);
          const blocks = output.blocks as Array<{ slotId: string; type: string; label: string; colSpan?: number }>;
          for (const slot of blocks) {
            canvasStore.getState().addBlock(storePageIndex, {
              id: slot.slotId,
              type: 'skeleton',
              targetType: slot.type as 'kpi' | 'chart' | 'table' | 'text',
              colSpan: (slot.colSpan ?? DEFAULT_COL_SPANS[slot.type] ?? 1) as 1 | 2 | 3,
              slotLabel: slot.label,
              slotStatus: 'pending',
            } satisfies SkeletonBlock);
          }
          console.log('[CanvasChat] Layout declared:', output.pageTitle, blocks.length, 'blocks');
        }

        // fill_block → update skeleton status or replace with real block
        if (toolName === 'fill_block') {
          const output = result as Record<string, unknown>;
          const serverPageIndex = output.pageIndex as number;
          const storePageIndex = pageIndexMap.current.get(serverPageIndex) ?? serverPageIndex;
          const slotId = output.slotId as string;
          const status = output.status as string;

          if (status === 'loading') {
            canvasStore.getState().updateSlotStatus(storePageIndex, slotId, 'loading');
          } else if (status === 'ready' && output.block) {
            const block = output.block as import('@/shared/config/agents/types').CanvasBlock;
            canvasStore.getState().replaceBlock(storePageIndex, slotId, block);
          } else if (status === 'error') {
            canvasStore.getState().updateSlotStatus(storePageIndex, slotId, 'error', output.error as string);
          }
          console.log('[CanvasChat] fill_block:', slotId, status);
        }

        // add_slot → add new skeleton block
        if (toolName === 'add_slot') {
          const output = result as Record<string, unknown>;
          const serverPageIndex = output.pageIndex as number;
          const storePageIndex = pageIndexMap.current.get(serverPageIndex) ?? serverPageIndex;
          canvasStore.getState().addBlock(storePageIndex, {
            id: output.slotId as string,
            type: 'skeleton',
            targetType: output.type as 'kpi' | 'chart' | 'table' | 'text',
            colSpan: (output.colSpan as 1 | 2 | 3) ?? 1,
            slotLabel: output.label as string,
            slotStatus: 'pending',
          } satisfies SkeletonBlock, output.position as number | undefined);
        }

        // remove_slot → remove block from canvas
        if (toolName === 'remove_slot') {
          const output = result as Record<string, unknown>;
          const serverPageIndex = output.pageIndex as number;
          const storePageIndex = pageIndexMap.current.get(serverPageIndex) ?? serverPageIndex;
          canvasStore.getState().removeBlock(storePageIndex, output.slotId as string);
        }
```

- [ ] **Step 6: Verify build**

Run: `pnpm build 2>&1 | head -30`

- [ ] **Step 7: Commit**

```bash
git add src/pages/explore/ui/CanvasChat.tsx
git commit -m "feat(explore): add CanvasChat handlers for skeleton-driven tools"
```

---

### Task 12: Update canvas orchestrator prompt

**Files:**
- Modify: `src/shared/config/agents/canvas-orchestrator.ts`

- [ ] **Step 1: Add skeleton-driven flow instructions**

In `canvas-orchestrator.ts`, before the closing of the `return` template literal (before `${ctx.bqmlEnabled ?` around line 216), add:

```typescript
## Fluxo de Construção — Skeleton-Driven

Você DEVE seguir este fluxo ao construir **novas páginas**:

### Passo 1: Planeje e declare o layout
Chame \`declare_layout\` com TODOS os blocos que planeja criar. Defina tipo, label e colSpan para cada um.
O usuário verá skeletons com labels imediatamente — isso melhora significativamente a experiência.

### Passo 2: Preencha em paralelo
Chame \`fill_block\` para TODOS os blocos no **MESMO step** (chamadas paralelas). Cada fill_block delega para um sub-agente especializado que consulta dados e retorna o bloco preenchido.

**Máximo 6 fill_block por step.** Se tem mais de 6 blocos, divida em 2 batches.

Para cada fill_block, passe:
- \`slotId\`: o ID declarado no layout
- \`pageIndex\`: índice da página retornado pelo declare_layout
- \`targetType\`: tipo do bloco (kpi, chart, table, text)
- \`intent\`: descrição DETALHADA do que calcular — inclua nome do indicador, filtros relevantes, e formato esperado
- \`agentType\`: tipo do sub-agente adequado:
  - "descriptive" → KPIs, resumos, consultas de dados, estatísticas
  - "diagnostic" → correlações, concentração, decomposição de variações
  - "predictive" → projeções, tendências, PD/LGD, early warnings
  - "simulation" → cenários, stress tests, sensibilidade
  - "prescriptive" → recomendações, priorização
  - "monitoring" → compliance, covenants, elegibilidade
  - "cashflow" → WAL, excess spread, fluxos
  - "external" → dados macro, Selic, IPCA

### Passo 3: Adapte se necessário
Após os fill_block completarem, analise os resultados:
- Se um resultado revela insight que merece destaque → \`add_slot\` + \`fill_block\`
- Se um slot não pôde ser preenchido → \`remove_slot\`
- Se precisa de bloco complementar → \`add_slot\` + \`fill_block\`

### Quando usar qual sistema
- **Criar página nova:** \`declare_layout\` + \`fill_block\` (skeleton-driven)
- **Editar página existente:** \`add_*_block\` / \`update_*_block\` / \`remove_block\` (tools existentes, sem mudança)

**IMPORTANTE:** Para criação de novas páginas, SEMPRE use declare_layout + fill_block. Não use query_data + add_*_block para páginas novas.
```

- [ ] **Step 2: Verify build**

Run: `pnpm build 2>&1 | head -30`

- [ ] **Step 3: Commit**

```bash
git add src/shared/config/agents/canvas-orchestrator.ts
git commit -m "feat(canvas): add skeleton-driven flow instructions to orchestrator prompt"
```

---

### Task 13: Manual smoke test

- [ ] **Step 1: Run dev server**

Run: `pnpm dev`

- [ ] **Step 2: Test in browser**

1. Navigate to `/explore`
2. Select a client (OM, BRZ, etc.)
3. Type a prompt like "Qual o resumo da carteira?" and submit
4. Verify:
   - Skeletons appear immediately with labels after declare_layout
   - Skeletons transition to loading state (pulse animation)
   - Blocks fill in as sub-agents complete
   - All block types render correctly (KPI, chart, table, text)
   - Chat shows tool badges for declare_layout, fill_block

5. Test adaptation: ask a follow-up that triggers add_slot (e.g., "Aprofunde a inadimplência com um gráfico extra")
6. Test error recovery: if a block fails, verify error state appears

- [ ] **Step 3: Test existing edit flow still works**

1. After a page is built, ask "Altere o título do gráfico para X"
2. Verify update_*_block tools still function correctly
3. Verify old add_*_block tools still work for edits

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix(explore): smoke test adjustments for skeleton-driven layout"
```
