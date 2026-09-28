# Immersive Conversational Analysis — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an immersive full-screen mode where the AI constructs interactive dashboard pages through conversation, with a Canvas Orchestrator meta-agent that plans indicators, queries BigQuery, and renders visualization blocks in real-time.

**Architecture:** New `/explore` route with a split layout (dashboard panel ~75% + chat ~25%). A Canvas Orchestrator meta-agent uses composition tools (`create_page`, `add_block`, `query_data`, etc.) to build pages. Tool invocations stream to the frontend via Vercel AI SDK's `useChat`, updating a Zustand `CanvasStore` that drives the panel rendering. Existing agents are delegated to via an `analyze` tool.

**Tech Stack:** Next.js 16 App Router, Vercel AI SDK (`streamText`, `useChat`, `tool`), Zustand, Recharts, TanStack React Table, shadcn/ui, Zod, Firebase Auth, BigQuery

**Spec:** `docs/superpowers/specs/2026-03-18-immersive-conversational-analysis-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/shared/lib/api-auth.ts` | Shared auth utility: `verifyAuthToken()` + `verifyDatasetAccess()` extracted from chat route |
| `src/shared/stores/canvas-store.ts` | Zustand store: pages, blocks, active page, CRUD methods |
| `src/shared/config/agents/canvas-orchestrator.ts` | System prompt builder for Canvas Orchestrator |
| `src/features/canvas-orchestrator/orchestrator.ts` | `createCanvasOrchestrator()` — streamText with canvas tools |
| `src/features/canvas-orchestrator/tools/plan-analysis.ts` | Tool: plan pages/blocks structure |
| `src/features/canvas-orchestrator/tools/create-page.ts` | Tool: create new page/tab |
| `src/features/canvas-orchestrator/tools/add-block.ts` | Tool: add block to page |
| `src/features/canvas-orchestrator/tools/query-data.ts` | Tool: execute SQL (wraps existing execute-sql) |
| `src/features/canvas-orchestrator/tools/get-filter-options.ts` | Tool: fetch available dates/projetos |
| `src/features/canvas-orchestrator/tools/analyze.ts` | Tool: delegate to existing agents |
| `app/api/canvas-chat/route.ts` | POST endpoint for canvas chat |
| `src/pages/explore/ui/ExplorePage.tsx` | Main immersive layout component |
| `src/pages/explore/ui/CanvasHeader.tsx` | Header with filters + page tabs |
| `src/pages/explore/ui/CanvasPanel.tsx` | Renders active page's blocks |
| `src/pages/explore/ui/CanvasChat.tsx` | Chat sidebar with useChat + stream handler |
| `src/pages/explore/ui/CanvasBlockRenderer.tsx` | Switch: renders block by type |
| `src/pages/explore/ui/blocks/TextBlock.tsx` | Markdown text block |
| `src/pages/explore/ui/blocks/KpiBlock.tsx` | Grid of KpiCards |
| `src/pages/explore/ui/blocks/ChartBlock.tsx` | Recharts chart block |
| `src/pages/explore/ui/blocks/TableBlock.tsx` | TanStack table block |
| `src/pages/explore/ui/blocks/BlockSkeleton.tsx` | Loading skeleton for blocks |
| `app/explore/page.tsx` | Next.js route: renders ExplorePage |

### Modified Files

| File | Change |
|------|--------|
| `app/api/chat/route.ts` | Extract auth into `api-auth.ts`, import from there |
| `src/pages/landing/ui/LandingPage.tsx` | Add "Análise Conversacional" card linking to `/explore` |
| `src/shared/config/agents/types.ts` | Add canvas-specific types (CanvasBlock union, CanvasPage) |

---

## Task 1: Extract Auth Utility

**Files:**
- Create: `src/shared/lib/api-auth.ts`
- Modify: `app/api/chat/route.ts`

- [ ] **Step 1: Create auth utility with functions extracted from chat route**

```typescript
// src/shared/lib/api-auth.ts
import { FIRESTORE_DATABASE_ID, isAdminEmail } from '@/shared/lib/runtime-config';

export async function verifyAuthToken(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const { getAuth } = await import('firebase-admin/auth');
    const { getApps, initializeApp, cert } = await import('firebase-admin/app');
    if (getApps().length === 0) {
      if (process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
        initializeApp({
          credential: cert({
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
          }),
        });
      } else {
        initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
      }
    }
    const decoded = await getAuth().verifyIdToken(authHeader.slice(7));
    return decoded.email ?? null;
  } catch {
    return null;
  }
}

export async function verifyDatasetAccess(email: string, dataset: string): Promise<{ allowed: boolean; error?: string; status?: number }> {
  if (!dataset || isAdminEmail(email)) return { allowed: true };
  const { getFirestore } = await import('firebase-admin/firestore');
  const db = FIRESTORE_DATABASE_ID ? getFirestore(FIRESTORE_DATABASE_ID) : getFirestore();
  const usersSnap = await db.collection('users').where('email', '==', email).limit(1).get();
  if (usersSnap.empty) return { allowed: false, error: 'Usuário não configurado', status: 403 };
  const userData = usersSnap.docs[0].data();
  const clientAccess: { clientId: string }[] = userData.clientAccess ?? [];
  const clientsSnap = await db.collection('clients').where('dataset', '==', dataset).limit(1).get();
  if (!clientsSnap.empty) {
    const clientId = clientsSnap.docs[0].id;
    if (!clientAccess.some((ca) => ca.clientId === clientId)) {
      return { allowed: false, error: 'Sem permissão para este cliente', status: 403 };
    }
  }
  return { allowed: true };
}
```

- [ ] **Step 2: Update chat route to use shared auth**

Replace the `verifyAuthToken` function and inline dataset check in `app/api/chat/route.ts` with imports from `api-auth.ts`:

```typescript
// app/api/chat/route.ts
import type { UIMessage } from 'ai';
import type { ChatRequestFilters, FocusedIndicator } from '@/shared/config/agents/types';
import { createOrchestrator } from '@/features/ai-agents/orchestrator';
import { verifyAuthToken, verifyDatasetAccess } from '@/shared/lib/api-auth';

export const maxDuration = 300;

export async function POST(req: Request) {
  const email = await verifyAuthToken(req);
  if (!email) {
    return new Response(JSON.stringify({ error: 'Nao autenticado' }), { status: 401 });
  }

  const body: {
    messages: UIMessage[];
    dataset: string;
    filters: ChatRequestFilters;
    dashboardState?: string;
    page: string;
    focusedIndicator?: FocusedIndicator;
  } = await req.json();

  const access = await verifyDatasetAccess(email, body.dataset);
  if (!access.allowed) {
    return new Response(JSON.stringify({ error: access.error }), { status: access.status });
  }

  const result = await createOrchestrator({
    messages: body.messages,
    dataset: body.dataset,
    filters: body.filters,
    dashboardState: body.dashboardState ?? '',
    page: body.page,
    focusedIndicator: body.focusedIndicator,
  });

  return result.toUIMessageStreamResponse();
}
```

- [ ] **Step 3: Verify dev server starts without errors**

Run: `pnpm dev` — check no import errors or type issues.

- [ ] **Step 4: Commit**

```bash
git add src/shared/lib/api-auth.ts app/api/chat/route.ts
git commit -m "refactor: extract auth utility from chat route to shared lib"
```

---

## Task 2: Canvas Types and Zustand Store

**Files:**
- Modify: `src/shared/config/agents/types.ts`
- Create: `src/shared/stores/canvas-store.ts`

- [ ] **Step 1: Add canvas types to agents/types.ts**

Append to the end of `src/shared/config/agents/types.ts`:

```typescript
// ── Canvas Orchestrator Types ──

interface BaseBlock {
  id: string;
}

export interface TextBlock extends BaseBlock {
  type: 'text';
  content: string;
}

export interface KpiBlockItem {
  label: string;
  value: string;
  trend?: string;
  trendDirection?: 'up' | 'down';
  trendIsPositive?: boolean;
  sparklineData?: number[];
}

export interface KpiBlock extends BaseBlock {
  type: 'kpis';
  items: KpiBlockItem[];
}

export interface ChartBlock extends BaseBlock {
  type: 'chart';
  chartType: 'bar' | 'line' | 'area' | 'composed' | 'stacked-bar';
  title?: string;
  data: Array<Record<string, string | number>>;
  dataKeys: string[];
  xAxisKey: string;
  colors?: string[];
  stacked?: boolean;
}

export interface TableBlock extends BaseBlock {
  type: 'table';
  columns: Array<{ header: string; accessorKey: string; format?: 'currency' | 'percent' | 'number' | 'date' }>;
  rows: Record<string, unknown>[];
}

export type CanvasBlock = TextBlock | KpiBlock | ChartBlock | TableBlock;

export interface CanvasPage {
  id: string;
  title: string;
  description?: string;
  blocks: CanvasBlock[];
}

export interface CanvasPageContext {
  id: string;
  title: string;
  blocks: Array<{ id: string; type: string; title?: string }>;
}
```

- [ ] **Step 2: Create canvas Zustand store**

```typescript
// src/shared/stores/canvas-store.ts
import { create } from 'zustand';
import type { CanvasBlock, CanvasPage, CanvasPageContext } from '@/shared/config/agents/types';

interface CanvasStore {
  sessionId: string | null;
  pages: CanvasPage[];
  activePage: number;
  isStreaming: boolean;

  // Actions
  createPage: (title: string, description?: string) => number;
  addBlock: (pageIndex: number, block: CanvasBlock, position?: number) => void;
  setActivePage: (index: number) => void;
  setStreaming: (streaming: boolean) => void;
  reset: () => void;

  // Selectors
  getActivePage: () => CanvasPage | null;
  getPagesContext: () => CanvasPageContext[];
}

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  sessionId: null,
  pages: [],
  activePage: 0,
  isStreaming: false,

  createPage: (title, description) => {
    const id = crypto.randomUUID();
    const newPage: CanvasPage = { id, title, description, blocks: [] };
    set((state) => {
      const pages = [...state.pages, newPage];
      return { pages, activePage: pages.length - 1 };
    });
    return get().pages.length - 1;
  },

  addBlock: (pageIndex, block, position) => {
    set((state) => {
      const pages = [...state.pages];
      const page = pages[pageIndex];
      if (!page) return state;
      const blocks = [...page.blocks];
      if (position !== undefined && position >= 0 && position <= blocks.length) {
        blocks.splice(position, 0, block);
      } else {
        blocks.push(block);
      }
      pages[pageIndex] = { ...page, blocks };
      return { pages };
    });
  },

  setActivePage: (index) => set({ activePage: index }),
  setStreaming: (isStreaming) => set({ isStreaming }),
  reset: () => set({ sessionId: null, pages: [], activePage: 0, isStreaming: false }),

  getActivePage: () => {
    const { pages, activePage } = get();
    return pages[activePage] ?? null;
  },

  getPagesContext: () => {
    return get().pages.map((p) => ({
      id: p.id,
      title: p.title,
      blocks: p.blocks.map((b) => ({
        id: b.id,
        type: b.type,
        title: b.type === 'chart' ? b.title : undefined,
      })),
    }));
  },
}));
```

- [ ] **Step 3: Verify types compile**

Run: `pnpm exec tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add src/shared/config/agents/types.ts src/shared/stores/canvas-store.ts
git commit -m "feat: add canvas types and Zustand store for immersive mode"
```

---

## Task 3: Canvas Orchestrator Tools

**Files:**
- Create: `src/features/canvas-orchestrator/tools/plan-analysis.ts`
- Create: `src/features/canvas-orchestrator/tools/create-page.ts`
- Create: `src/features/canvas-orchestrator/tools/add-block.ts`
- Create: `src/features/canvas-orchestrator/tools/query-data.ts`
- Create: `src/features/canvas-orchestrator/tools/get-filter-options.ts`
- Create: `src/features/canvas-orchestrator/tools/analyze.ts`

These tools follow the existing pattern from `src/features/ai-agents/tools/execute-sql.ts` — each is a factory function returning a Vercel AI `tool()`.

- [ ] **Step 1: Create plan_analysis tool**

```typescript
// src/features/canvas-orchestrator/tools/plan-analysis.ts
import { tool } from 'ai';
import { z } from 'zod';

export function createPlanAnalysisTool() {
  return tool({
    description: 'Planeja a estrutura de páginas e blocos de visualização antes de construí-los. SEMPRE use esta tool primeiro para pensar a estrutura da análise.',
    inputSchema: z.object({
      userRequest: z.string().describe('O pedido original do usuário'),
      plan: z.object({
        pages: z.array(z.object({
          title: z.string(),
          description: z.string(),
          blocks: z.array(z.object({
            type: z.enum(['text', 'kpis', 'chart', 'table']),
            description: z.string().describe('O que este bloco deve mostrar'),
            queryHint: z.string().optional().describe('Dica de query SQL necessária'),
          })),
        })),
      }),
    }),
    execute: async ({ plan }) => {
      return { success: true, plan };
    },
  });
}
```

- [ ] **Step 2: Create create_page tool**

```typescript
// src/features/canvas-orchestrator/tools/create-page.ts
import { tool } from 'ai';
import { z } from 'zod';

// Track page count per orchestrator session so we can return deterministic pageIndex.
// The LLM needs this to target pages in subsequent add_block calls.
let pageCounter = 0;

export function createCreatePageTool() {
  // Reset counter for each new orchestrator session
  pageCounter = 0;

  return tool({
    description: 'Cria uma nova página/aba no painel de visualização. Retorna o pageIndex para uso em add_block.',
    inputSchema: z.object({
      title: z.string().describe('Título da página'),
      description: z.string().optional().describe('Descrição curta da página'),
    }),
    execute: async ({ title, description }) => {
      const pageIndex = pageCounter++;
      // The actual page creation happens on the frontend via the streaming handler.
      return { action: 'create_page', title, description, pageIndex };
    },
  });
}
```

- [ ] **Step 3: Create add_block tool**

```typescript
// src/features/canvas-orchestrator/tools/add-block.ts
import { tool } from 'ai';
import { z } from 'zod';

const kpiItemSchema = z.object({
  label: z.string(),
  value: z.string(),
  trend: z.string().optional(),
  trendDirection: z.enum(['up', 'down']).optional(),
  trendIsPositive: z.boolean().optional(),
  sparklineData: z.array(z.number()).optional(),
});

const blockSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    content: z.string().describe('Conteúdo em markdown'),
  }),
  z.object({
    type: z.literal('kpis'),
    items: z.array(kpiItemSchema).min(1).max(6),
  }),
  z.object({
    type: z.literal('chart'),
    chartType: z.enum(['bar', 'line', 'area', 'composed', 'stacked-bar']),
    title: z.string().optional(),
    data: z.array(z.record(z.union([z.string(), z.number()]))),
    dataKeys: z.array(z.string()).describe('Campos a plotar no eixo Y'),
    xAxisKey: z.string().describe('Campo do eixo X'),
    colors: z.array(z.string()).optional(),
    stacked: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('table'),
    columns: z.array(z.object({
      header: z.string(),
      accessorKey: z.string(),
      format: z.enum(['currency', 'percent', 'number', 'date']).optional(),
    })),
    rows: z.array(z.record(z.unknown())).describe('Máximo 100 rows'),
  }),
]);

export function createAddBlockTool() {
  return tool({
    description: 'Adiciona um bloco de visualização (texto, KPIs, gráfico ou tabela) a uma página existente.',
    inputSchema: z.object({
      pageIndex: z.number().describe('Índice da página (retornado por create_page)'),
      block: blockSchema,
      position: z.number().optional().describe('Posição do bloco na página (0 = topo). Omita para adicionar ao final.'),
    }),
    execute: async ({ pageIndex, block, position }) => {
      const blockId = crypto.randomUUID();
      return { action: 'add_block', pageIndex, block: { ...block, id: blockId }, position };
    },
  });
}
```

- [ ] **Step 4: Create query_data tool**

```typescript
// src/features/canvas-orchestrator/tools/query-data.ts
import { tool } from 'ai';
import { z } from 'zod';
import { getBigQueryClient } from '@/shared/lib/bigquery/client';

const MAX_ROWS_TO_LLM = 500;

export function createQueryDataTool(dataset: string) {
  return tool({
    description: 'Executa uma query SQL read-only no BigQuery. Use para buscar dados que serão usados em add_block. Retorna até 500 rows no contexto do LLM; para tabelas no frontend use até 100 rows no add_block.',
    inputSchema: z.object({
      sql: z.string().describe('Query SQL (apenas SELECT/WITH)'),
      description: z.string().describe('Descrição do que a query busca'),
    }),
    execute: async ({ sql, description }) => {
      // Security: block write operations
      const normalized = sql.trim().toUpperCase();
      if (/^\s*(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|MERGE)\b/.test(normalized)) {
        return { success: false, error: 'Apenas queries SELECT/WITH são permitidas', rowCount: 0 };
      }
      try {
        const client = getBigQueryClient();
        const [rows] = await client.query({ query: sql, useLegacySql: false, jobTimeoutMs: 60_000 });
        // Only return truncated data to LLM context to avoid blowing up tokens.
        // The LLM should use this data to compose add_block calls.
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
  });
}
```

- [ ] **Step 5: Create get_filter_options tool**

```typescript
// src/features/canvas-orchestrator/tools/get-filter-options.ts
import { tool } from 'ai';
import { z } from 'zod';
import { getBigQueryClient } from '@/shared/lib/bigquery/client';

export function createGetFilterOptionsTool(dataset: string) {
  return tool({
    description: 'Busca as opções de filtro disponíveis para o dataset (datas base e projetos).',
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const client = getBigQueryClient();
        const [dateRows] = await client.query({
          query: `SELECT DISTINCT data_base FROM \`${dataset}.contratos\` ORDER BY data_base DESC LIMIT 24`,
          useLegacySql: false,
        });
        const [projetoRows] = await client.query({
          query: `SELECT DISTINCT projeto FROM \`${dataset}.contratos\` WHERE projeto IS NOT NULL ORDER BY projeto`,
          useLegacySql: false,
        });
        return {
          success: true,
          dates: dateRows.map((r: Record<string, unknown>) => r.data_base),
          projetos: projetoRows.map((r: Record<string, unknown>) => r.projeto),
        };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Erro ao buscar opções' };
      }
    },
  });
}
```

- [ ] **Step 6: Create analyze tool (delegates to existing agents)**

```typescript
// src/features/canvas-orchestrator/tools/analyze.ts
import { tool, generateText, stepCountIs } from 'ai';
import { z } from 'zod';
import { getModel } from '@/features/ai-agents/model-registry';
import type { AgentDynamicContext } from '@/shared/config/agents/types';
import { buildDescriptiveAgentPrompt } from '@/shared/config/agents/descriptive-agent';
import { buildDiagnosticAgentPrompt } from '@/shared/config/agents/diagnostic-agent';
import { buildPredictiveAgentPrompt } from '@/shared/config/agents/predictive-agent';
import { buildSimulationAgentPrompt } from '@/shared/config/agents/simulation-agent';
import { buildPrescriptiveAgentPrompt } from '@/shared/config/agents/prescriptive-agent';
import { buildMonitoringAgentPrompt } from '@/shared/config/agents/monitoring-agent';
import { buildCashflowAgentPrompt } from '@/shared/config/agents/cashflow-agent';
import { buildExternalAgentPrompt } from '@/shared/config/agents/external-agent';
import { createExecuteSqlTool } from '@/features/ai-agents/tools/execute-sql';
import { createGetTableSchemaTool } from '@/features/ai-agents/tools/get-table-schema';
import { createGetSampleDataTool } from '@/features/ai-agents/tools/get-sample-data';

// Maps agent type to its system prompt builder
const PROMPT_BUILDERS: Record<string, (ctx: AgentDynamicContext) => string> = {
  descriptive: buildDescriptiveAgentPrompt,
  diagnostic: buildDiagnosticAgentPrompt,
  predictive: buildPredictiveAgentPrompt,
  simulation: buildSimulationAgentPrompt,
  prescriptive: buildPrescriptiveAgentPrompt,
  monitoring: buildMonitoringAgentPrompt,
  cashflow: buildCashflowAgentPrompt,
  external: buildExternalAgentPrompt,
};

const VALID_AGENTS = Object.keys(PROMPT_BUILDERS) as [string, ...string[]];

export function createAnalyzeTool(ctx: AgentDynamicContext) {
  return tool({
    description: 'Delega análise textual para um agente especializado. Use para gerar insights sobre dados já visualizados. Agentes: descriptive, diagnostic, predictive, simulation, prescriptive, monitoring, cashflow, external.',
    inputSchema: z.object({
      agent: z.enum(VALID_AGENTS).describe('Tipo de agente'),
      question: z.string().describe('Pergunta para o agente responder'),
      context: z.string().describe('Contexto dos dados já exibidos nas páginas'),
    }),
    execute: async ({ agent, question, context }) => {
      try {
        const buildPrompt = PROMPT_BUILDERS[agent];
        if (!buildPrompt) return { success: false, error: `Agente '${agent}' não encontrado` };

        // Use generateText directly (non-streaming) with the agent's prompt and basic tools
        const result = await generateText({
          model: getModel('fast'),
          system: buildPrompt(ctx),
          tools: {
            execute_sql: createExecuteSqlTool(ctx.dataset),
            get_table_schema: createGetTableSchemaTool(ctx.dataset),
            get_sample_data: createGetSampleDataTool(ctx.dataset),
          },
          stopWhen: stepCountIs(8),
          prompt: `${context}\n\n${question}`,
        });

        return { success: true, text: result.text || 'Sem resposta do agente' };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Erro na análise' };
      }
    },
  });
}
```

- [ ] **Step 7: Verify types compile**

Run: `pnpm exec tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 8: Commit**

```bash
git add src/features/canvas-orchestrator/
git commit -m "feat: add canvas orchestrator tools (plan, create_page, add_block, query_data, analyze)"
```

---

## Task 4: Canvas Orchestrator System Prompt and Orchestrator

**Files:**
- Create: `src/shared/config/agents/canvas-orchestrator.ts`
- Create: `src/features/canvas-orchestrator/orchestrator.ts`

- [ ] **Step 1: Create system prompt builder**

```typescript
// src/shared/config/agents/canvas-orchestrator.ts
import type { ChatRequestFilters, CanvasPageContext } from './types';

interface CanvasOrchestratorContext {
  dataset: string;
  filters: ChatRequestFilters;
  pagesContext: CanvasPageContext[];
}

export function buildCanvasOrchestratorPrompt(ctx: CanvasOrchestratorContext): string {
  const filterSummary = [
    `Período: ${ctx.filters.dateRange.start} a ${ctx.filters.dateRange.end}`,
    ctx.filters.projetos.length > 0 ? `Projetos: ${ctx.filters.projetos.join(', ')}` : null,
  ].filter(Boolean).join('\n');

  const pagesState = ctx.pagesContext.length > 0
    ? ctx.pagesContext.map((p, i) =>
        `Página ${i} "${p.title}": ${p.blocks.length} blocos [${p.blocks.map(b => b.type).join(', ')}]`
      ).join('\n')
    : 'Nenhuma página criada ainda.';

  return `Você é um analista sênior de crédito securitizado da Liquid. Seu papel é construir dashboards de análise interativos através de conversa.

## Seu Comportamento

Você constrói **páginas de visualização** que contam uma história analítica. Cada página tem um tema (ex: "Visão Geral", "Risco de Repasse") e contém blocos organizados em um storytelling lógico.

### Regras de Construção

1. **SEMPRE comece com plan_analysis** para estruturar o que vai construir
2. Use **get_table_schema** e **get_sample_data** para entender os dados antes de escrever SQL
3. Cada página deve ter um **título claro** e **descrição** explicando o que o usuário verá
4. Ordene os blocos para construir um raciocínio: contexto geral → detalhamento → insights
5. Inclua blocos de texto narrativo entre as visualizações para explicar o que os dados mostram
6. Para KPIs, mostre no máximo 4-6 por bloco para não poluir
7. Para tabelas, limite a 100 rows
8. Para gráficos, escolha o tipo adequado:
   - \`bar\` para comparação entre categorias
   - \`line\` para evolução temporal
   - \`area\` para volumes ao longo do tempo
   - \`stacked-bar\` para composição de categorias
   - \`composed\` para combinar barras e linhas

### Quando Criar Nova Página vs. Adicionar Bloco

- **Nova página**: quando o tema muda significativamente (ex: de "visão geral" para "inadimplência")
- **Adicionar bloco**: quando está aprofundando o mesmo tema na página atual
- **Texto no chat**: para respostas curtas, esclarecimentos, ou quando o usuário não pediu visualização

### Resposta a Perguntas

Quando o usuário pergunta sobre dados já exibidos:
- Se a resposta é analítica/complexa: use **analyze** para delegar a um agente especializado
- Se precisa de novos dados visuais: crie blocos adicionais ou nova página
- Se é uma pergunta simples: responda diretamente no chat

## Dataset e Filtros Ativos

Dataset: \`${ctx.dataset}\`
${filterSummary}

## Estado Atual das Páginas

${pagesState}

## Formato

- Responda SEMPRE em português brasileiro
- Use markdown no chat para formatação
- Valores monetários em formato brasileiro (R$ X.XXX,XX)
- Percentuais com vírgula como separador decimal
- Use as tools disponíveis — não invente dados`;
}
```

- [ ] **Step 2: Create canvas orchestrator**

```typescript
// src/features/canvas-orchestrator/orchestrator.ts
import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from 'ai';
import { getModel } from '@/features/ai-agents/model-registry';
import { buildCanvasOrchestratorPrompt } from '@/shared/config/agents/canvas-orchestrator';
import type { ChatRequestFilters, CanvasPageContext, AgentDynamicContext } from '@/shared/config/agents/types';
import { createPlanAnalysisTool } from './tools/plan-analysis';
import { createCreatePageTool } from './tools/create-page';
import { createAddBlockTool } from './tools/add-block';
import { createQueryDataTool } from './tools/query-data';
import { createGetFilterOptionsTool } from './tools/get-filter-options';
import { createAnalyzeTool } from './tools/analyze';
import { createGetTableSchemaTool } from '@/features/ai-agents/tools/get-table-schema';
import { createGetSampleDataTool } from '@/features/ai-agents/tools/get-sample-data';

interface CanvasOrchestratorInput {
  messages: UIMessage[];
  dataset: string;
  filters: ChatRequestFilters;
  pagesContext: CanvasPageContext[];
}

export async function createCanvasOrchestrator(input: CanvasOrchestratorInput) {
  const ctx: AgentDynamicContext = {
    dataset: input.dataset,
    filters: input.filters,
    dashboardState: '',
    page: 'explore',
  };

  return streamText({
    model: getModel('reasoning'),
    system: buildCanvasOrchestratorPrompt({
      dataset: input.dataset,
      filters: input.filters,
      pagesContext: input.pagesContext,
    }),
    messages: await convertToModelMessages(input.messages),
    tools: {
      plan_analysis: createPlanAnalysisTool(),
      create_page: createCreatePageTool(),
      add_block: createAddBlockTool(),
      query_data: createQueryDataTool(input.dataset),
      get_filter_options: createGetFilterOptionsTool(input.dataset),
      get_table_schema: createGetTableSchemaTool(input.dataset),
      get_sample_data: createGetSampleDataTool(input.dataset),
      analyze: createAnalyzeTool(ctx),
    },
    stopWhen: stepCountIs(30),
    toolChoice: 'auto',
  });
}
```

- [ ] **Step 3: Verify types compile**

Run: `pnpm exec tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add src/shared/config/agents/canvas-orchestrator.ts src/features/canvas-orchestrator/orchestrator.ts
git commit -m "feat: add canvas orchestrator with system prompt and tool wiring"
```

---

## Task 5: Canvas Chat API Endpoint

**Files:**
- Create: `app/api/canvas-chat/route.ts`

- [ ] **Step 1: Create the endpoint**

```typescript
// app/api/canvas-chat/route.ts
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

  const body: {
    messages: UIMessage[];
    dataset: string;
    filters: ChatRequestFilters;
    pagesContext: CanvasPageContext[];
  } = await req.json();

  const access = await verifyDatasetAccess(email, body.dataset);
  if (!access.allowed) {
    return new Response(JSON.stringify({ error: access.error }), { status: access.status });
  }

  const result = await createCanvasOrchestrator({
    messages: body.messages,
    dataset: body.dataset,
    filters: body.filters,
    pagesContext: body.pagesContext ?? [],
  });

  return result.toUIMessageStreamResponse();
}
```

- [ ] **Step 2: Verify dev server picks up the route**

Run: `pnpm dev` then `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/canvas-chat`
Expected: 401 (no auth token)

- [ ] **Step 3: Commit**

```bash
git add app/api/canvas-chat/route.ts
git commit -m "feat: add /api/canvas-chat endpoint for immersive mode"
```

---

## Task 6: Block Renderer Components

**Files:**
- Create: `src/pages/explore/ui/blocks/TextBlock.tsx`
- Create: `src/pages/explore/ui/blocks/KpiBlock.tsx`
- Create: `src/pages/explore/ui/blocks/ChartBlock.tsx`
- Create: `src/pages/explore/ui/blocks/TableBlock.tsx`
- Create: `src/pages/explore/ui/blocks/BlockSkeleton.tsx`
- Create: `src/pages/explore/ui/CanvasBlockRenderer.tsx`

- [ ] **Step 1: Create TextBlock**

```typescript
// src/pages/explore/ui/blocks/TextBlock.tsx
'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { TextBlock as TextBlockType } from '@/shared/config/agents/types';

export function TextBlock({ block }: { block: TextBlockType }) {
  return (
    <div className="prose prose-invert prose-sm max-w-none px-1">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {block.content}
      </ReactMarkdown>
    </div>
  );
}
```

- [ ] **Step 2: Create KpiBlock**

```typescript
// src/pages/explore/ui/blocks/KpiBlock.tsx
'use client';

import { KpiCard } from '@/widgets/kpi-grid/ui/KpiCard';
import type { KpiBlock as KpiBlockType } from '@/shared/config/agents/types';

export function KpiBlock({ block }: { block: KpiBlockType }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {block.items.map((item, i) => (
        <KpiCard
          key={`${block.id}-${i}`}
          variant="compact"
          label={item.label}
          value={item.value}
          trend={item.trend ? {
            value: item.trend,
            direction: item.trendDirection ?? 'up',
          } : undefined}
          sparklineData={item.sparklineData}
          animationIndex={i}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create ChartBlock**

Reference: `SimpleBarChart` uses `data`, `categoryKey`, `valueKey`, `color`. The canvas `ChartBlock` has `data`, `xAxisKey`, `dataKeys`.

```typescript
// src/pages/explore/ui/blocks/ChartBlock.tsx
'use client';

import { SimpleBarChartComponent } from '@/widgets/chart-widget/ui/SimpleBarChart';
import { CHART_COLORS, CHART_AXIS_STYLE, CHART_GRID_STYLE, CHART_TOOLTIP_STYLE } from '@/shared/config/chart-theme';
import type { ChartBlock as ChartBlockType } from '@/shared/config/agents/types';
import {
  BarChart, Bar, AreaChart, Area, LineChart, Line, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const PALETTE = [CHART_COLORS.primary, CHART_COLORS.chart3, CHART_COLORS.chart4, CHART_COLORS.chart5, CHART_COLORS.chart6];

export function ChartBlock({ block }: { block: ChartBlockType }) {
  const colors = block.colors ?? PALETTE;

  if (block.chartType === 'bar') {
    if (block.dataKeys.length === 1) {
      return (
        <div className="h-[280px] w-full">
          <SimpleBarChartComponent
            data={block.data}
            categoryKey={block.xAxisKey}
            valueKey={block.dataKeys[0]}
            color={colors[0]}
          />
        </div>
      );
    }
    // Multi-key bar (grouped)
    return (
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={block.data} barCategoryGap="25%">
            <CartesianGrid {...CHART_GRID_STYLE} />
            <XAxis dataKey={block.xAxisKey} {...CHART_AXIS_STYLE} />
            <YAxis {...CHART_AXIS_STYLE} />
            <Tooltip {...CHART_TOOLTIP_STYLE} />
            <Legend />
            {block.dataKeys.map((key, i) => (
              <Bar key={key} dataKey={key} fill={colors[i % colors.length]} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (block.chartType === 'stacked-bar') {
    return (
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={block.data} barCategoryGap="25%">
            <CartesianGrid {...CHART_GRID_STYLE} />
            <XAxis dataKey={block.xAxisKey} {...CHART_AXIS_STYLE} />
            <YAxis {...CHART_AXIS_STYLE} />
            <Tooltip {...CHART_TOOLTIP_STYLE} />
            <Legend />
            {block.dataKeys.map((key, i) => (
              <Bar key={key} dataKey={key} stackId="stack" fill={colors[i % colors.length]} radius={i === block.dataKeys.length - 1 ? [4, 4, 0, 0] : undefined} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (block.chartType === 'line') {
    return (
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={block.data}>
            <CartesianGrid {...CHART_GRID_STYLE} />
            <XAxis dataKey={block.xAxisKey} {...CHART_AXIS_STYLE} />
            <YAxis {...CHART_AXIS_STYLE} />
            <Tooltip {...CHART_TOOLTIP_STYLE} />
            <Legend />
            {block.dataKeys.map((key, i) => (
              <Line key={key} type="monotone" dataKey={key} stroke={colors[i % colors.length]} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (block.chartType === 'area') {
    return (
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={block.data}>
            <CartesianGrid {...CHART_GRID_STYLE} />
            <XAxis dataKey={block.xAxisKey} {...CHART_AXIS_STYLE} />
            <YAxis {...CHART_AXIS_STYLE} />
            <Tooltip {...CHART_TOOLTIP_STYLE} />
            <Legend />
            {block.dataKeys.map((key, i) => (
              <Area key={key} type="monotone" dataKey={key} fill={colors[i % colors.length]} stroke={colors[i % colors.length]} fillOpacity={0.3} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // composed: first key as bars, rest as lines
  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={block.data}>
          <CartesianGrid {...CHART_GRID_STYLE} />
          <XAxis dataKey={block.xAxisKey} {...CHART_AXIS_STYLE} />
          <YAxis {...CHART_AXIS_STYLE} />
          <Tooltip {...CHART_TOOLTIP_STYLE} />
          <Legend />
          {block.dataKeys.map((key, i) =>
            i === 0 ? (
              <Bar key={key} dataKey={key} fill={colors[i % colors.length]} radius={[4, 4, 0, 0]} />
            ) : (
              <Line key={key} type="monotone" dataKey={key} stroke={colors[i % colors.length]} strokeWidth={2} dot={false} />
            )
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 4: Create TableBlock**

```typescript
// src/pages/explore/ui/blocks/TableBlock.tsx
'use client';

import { useMemo } from 'react';
import { DataTableWidget } from '@/widgets/data-table-widget';
import type { TableBlock as TableBlockType } from '@/shared/config/agents/types';
import type { ColumnDef } from '@tanstack/react-table';

function formatValue(value: unknown, format?: string): string {
  if (value == null) return '—';
  if (format === 'currency') return `R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  if (format === 'percent') return `${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%`;
  if (format === 'number') return Number(value).toLocaleString('pt-BR');
  return String(value);
}

export function TableBlock({ block }: { block: TableBlockType }) {
  const columns: ColumnDef<Record<string, unknown>>[] = useMemo(() =>
    block.columns.map((col) => ({
      header: col.header,
      accessorKey: col.accessorKey,
      cell: ({ getValue }) => formatValue(getValue(), col.format),
    })),
    [block.columns],
  );

  return (
    <DataTableWidget
      columns={columns}
      data={block.rows}
      pageSize={10}
    />
  );
}
```

- [ ] **Step 5: Create BlockSkeleton**

```typescript
// src/pages/explore/ui/blocks/BlockSkeleton.tsx
'use client';

import { Skeleton } from '@/shared/ui/skeleton';

export function BlockSkeleton() {
  return (
    <div className="space-y-3 rounded-xl border border-border/40 bg-card/50 p-4">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-3 w-72" />
      <div className="grid grid-cols-3 gap-3">
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create CanvasBlockRenderer**

```typescript
// src/pages/explore/ui/CanvasBlockRenderer.tsx
'use client';

import type { CanvasBlock } from '@/shared/config/agents/types';
import { TextBlock } from './blocks/TextBlock';
import { KpiBlock } from './blocks/KpiBlock';
import { ChartBlock } from './blocks/ChartBlock';
import { TableBlock } from './blocks/TableBlock';

export function CanvasBlockRenderer({ block }: { block: CanvasBlock }) {
  switch (block.type) {
    case 'text':
      return <TextBlock block={block} />;
    case 'kpis':
      return <KpiBlock block={block} />;
    case 'chart':
      return <ChartBlock block={block} />;
    case 'table':
      return <TableBlock block={block} />;
    default:
      return null;
  }
}
```

- [ ] **Step 7: Verify types compile**

Run: `pnpm exec tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 8: Commit**

```bash
git add src/pages/explore/
git commit -m "feat: add canvas block renderer components (text, KPI, chart, table)"
```

---

## Task 7: Immersive Layout — CanvasHeader, CanvasPanel, CanvasChat

**Files:**
- Create: `src/pages/explore/ui/CanvasHeader.tsx`
- Create: `src/pages/explore/ui/CanvasPanel.tsx`
- Create: `src/pages/explore/ui/CanvasChat.tsx`

- [ ] **Step 1: Create CanvasHeader**

```typescript
// src/pages/explore/ui/CanvasHeader.tsx
'use client';

import Link from 'next/link';
import { ArrowLeft, Calendar, FolderOpen } from 'lucide-react';
import { useCanvasStore } from '@/shared/stores/canvas-store';
import { useDataFilters } from '@/shared/providers/DataProvider';
import { cn } from '@/shared/lib/utils';

export function CanvasHeader() {
  const { pages, activePage, setActivePage } = useCanvasStore();
  const filterCtx = useDataFilters();

  const dateLabel = filterCtx?.dateRange
    ? `${filterCtx.dateRange.start} — ${filterCtx.dateRange.end}`
    : '';
  const projetoLabel = filterCtx?.projetos?.length
    ? filterCtx.projetos.join(', ')
    : 'Todos';

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border/40 bg-background/80 px-4 backdrop-blur-sm">
      <Link
        href="/"
        className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        <span className="text-sm font-medium">Voltar</span>
      </Link>

      <div className="mx-3 h-5 w-px bg-border/60" />

      {/* Page tabs */}
      <nav className="flex items-center gap-1 overflow-x-auto">
        {pages.map((page, i) => (
          <button
            key={page.id}
            onClick={() => setActivePage(i)}
            className={cn(
              'flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              i === activePage
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
            )}
          >
            {page.title}
          </button>
        ))}
      </nav>

      <div className="flex-1" />

      {/* Global filter indicators */}
      {dateLabel && (
        <div className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3" />
          {dateLabel}
        </div>
      )}
      <div className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground">
        <FolderOpen className="h-3 w-3" />
        {projetoLabel}
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Create CanvasPanel**

```typescript
// src/pages/explore/ui/CanvasPanel.tsx
'use client';

import { useCanvasStore } from '@/shared/stores/canvas-store';
import { CanvasBlockRenderer } from './CanvasBlockRenderer';
import { Sparkles } from 'lucide-react';
import { ScrollArea } from '@/shared/ui/scroll-area';

export function CanvasPanel() {
  const page = useCanvasStore((s) => s.pages[s.activePage] ?? null);

  if (!page) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
        <Sparkles className="h-12 w-12 opacity-30" />
        <div className="text-center">
          <p className="text-lg font-medium text-foreground/80">Análise Conversacional</p>
          <p className="mt-1 text-sm">
            Comece perguntando algo sobre sua carteira no chat ao lado.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-6 p-6">
        {/* Page header */}
        <div>
          <h2 className="text-xl font-semibold text-foreground">{page.title}</h2>
          {page.description && (
            <p className="mt-1 text-sm text-muted-foreground">{page.description}</p>
          )}
        </div>

        {/* Blocks */}
        {page.blocks.map((block) => (
          <div
            key={block.id}
            className="animate-in fade-in slide-in-from-bottom-2 rounded-xl border border-border/40 bg-card/50 p-4 duration-500"
          >
            <CanvasBlockRenderer block={block} />
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
```

- [ ] **Step 3: Create CanvasChat**

This is the critical component that bridges the AI SDK stream to the Zustand store.

```typescript
// src/pages/explore/ui/CanvasChat.tsx
'use client';

import { useRef, useEffect, useCallback, useMemo } from 'react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useChat } from '@ai-sdk/react';
import { useCanvasStore } from '@/shared/stores/canvas-store';
import { useDataFilters } from '@/shared/providers/DataProvider';
import { useActiveDataset } from '@/shared/hooks/useActiveClient';
import { Send, Sparkles, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { CanvasBlock } from '@/shared/config/agents/types';

export function CanvasChat() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const processedToolCallIds = useRef(new Set<string>());
  const dataset = useActiveDataset();
  const filterCtx = useDataFilters();
  const { createPage, addBlock, setStreaming, getPagesContext } = useCanvasStore();

  // Process tool invocations from the stream — with deduplication
  const handleToolResult = useCallback((toolCallId: string, toolName: string, result: Record<string, unknown>) => {
    if (processedToolCallIds.current.has(toolCallId)) return;
    processedToolCallIds.current.add(toolCallId);

    if (toolName === 'create_page') {
      createPage(result.title as string, result.description as string | undefined);
    } else if (toolName === 'add_block') {
      const pageIndex = result.pageIndex as number;
      const block = result.block as CanvasBlock;
      const position = result.position as number | undefined;
      addBlock(pageIndex, block, position);
    }
    // plan_analysis, query_data, get_filter_options, analyze — no UI side effects
  }, [createPage, addBlock]);

  // Transport with auth — body is sent per-message via sendMessage, not here.
  const transport = useMemo(() => new DefaultChatTransport({
    api: '/api/canvas-chat',
    headers: async (): Promise<Record<string, string>> => {
      try {
        const { getFirebaseAuth } = await import('@/shared/lib/firebase/config');
        const user = getFirebaseAuth().currentUser;
        if (user) {
          const token = await user.getIdToken(true);
          return { Authorization: `Bearer ${token}` };
        }
      } catch (err) {
        console.error('[CanvasChat] Failed to get auth token:', err);
      }
      return {};
    },
  }), []);

  const { messages, sendMessage, input, setInput, status } = useChat({
    transport,
    onError: (error) => {
      console.error('[CanvasChat] Chat error:', error);
    },
  });

  const isLoading = status === 'streaming' || status === 'submitted';

  // Build body lazily per-message so pagesContext is always fresh
  const buildBody = useCallback(() => ({
    dataset,
    filters: {
      dateRange: filterCtx?.dateRange ?? { start: '', end: '' },
      projetos: filterCtx?.projetos ?? [],
      advancedFilters: filterCtx?.advancedFilters ?? {
        ratings: [], elegibilidade: [], faixaLtv: [],
        faixaAtraso: [], tipoProponente: [], gruposRepasse: [],
      },
      compareEnabled: filterCtx?.compareEnabled ?? false,
      comparePeriod: filterCtx?.comparePeriod,
      viewMode: filterCtx?.viewMode ?? 'snapshot',
    },
    pagesContext: getPagesContext(),
  }), [dataset, filterCtx, getPagesContext]);

  // Process tool invocations from messages
  useEffect(() => {
    for (const msg of messages) {
      if (msg.role !== 'assistant') continue;
      for (const part of msg.parts ?? []) {
        if (part.type === 'tool-invocation' && part.state === 'result') {
          handleToolResult(
            part.toolInvocation.toolCallId,
            part.toolInvocation.toolName,
            part.toolInvocation.result as Record<string, unknown>,
          );
        }
      }
    }
  }, [messages, handleToolResult]);

  // Update streaming state
  useEffect(() => {
    setStreaming(isLoading);
  }, [isLoading, setStreaming]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage({ text: input }, { body: buildBody() });
    setInput('');
  };

  return (
    <div className="flex h-full flex-col border-l border-border/40 bg-background/50">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border/40 px-4 py-3">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">Conversa</span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="py-8 text-center text-xs text-muted-foreground">
            Pergunte sobre sua carteira para começar a análise.
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            Construindo análise...
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={onSubmit} className="border-t border-border/40 p-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSubmit(e);
              }
            }}
            placeholder="Pergunte sobre sua carteira..."
            rows={1}
            className="flex-1 resize-none rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className="flex gap-2">
      <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${isUser ? 'bg-muted' : 'bg-primary/20'}`}>
        {isUser ? <User className="h-3 w-3" /> : <Sparkles className="h-3 w-3 text-primary" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-muted-foreground">
          {isUser ? 'Você' : 'Liquid AI'}
        </div>
        <div className="prose prose-invert prose-xs mt-0.5 max-w-none text-sm leading-relaxed">
          {(message.parts ?? []).map((part, i) => {
            if (part.type === 'text' && part.text) {
              return (
                <ReactMarkdown key={i} remarkPlugins={[remarkGfm]}>
                  {part.text}
                </ReactMarkdown>
              );
            }
            if (part.type === 'tool-invocation') {
              const name = part.toolInvocation.toolName;
              if (name === 'create_page' && part.state === 'result') {
                return (
                  <div key={i} className="my-1 rounded-md border border-primary/20 bg-primary/5 px-2 py-1 text-xs text-primary">
                    Página criada: {(part.toolInvocation.result as Record<string, unknown>)?.title as string}
                  </div>
                );
              }
              if (part.state === 'call' || part.state === 'partial-call') {
                return (
                  <div key={i} className="my-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                    {name.replace(/_/g, ' ')}...
                  </div>
                );
              }
              return null;
            }
            return null;
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify types compile**

Run: `pnpm exec tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 5: Commit**

```bash
git add src/pages/explore/ui/CanvasHeader.tsx src/pages/explore/ui/CanvasPanel.tsx src/pages/explore/ui/CanvasChat.tsx
git commit -m "feat: add immersive layout components (header, panel, chat)"
```

---

## Task 8: ExplorePage and Route

**Files:**
- Create: `src/pages/explore/ui/ExplorePage.tsx`
- Create: `app/explore/page.tsx`

- [ ] **Step 1: Create ExplorePage**

```typescript
// src/pages/explore/ui/ExplorePage.tsx
'use client';

import { CanvasHeader } from './CanvasHeader';
import { CanvasPanel } from './CanvasPanel';
import { CanvasChat } from './CanvasChat';
import { ProtectedRoute } from '@/features/auth/ui/ProtectedRoute';
import { DataProvider } from '@/shared/providers/DataProvider';
import { Monitor } from 'lucide-react';

function DesktopOnlyGate({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Desktop: show content */}
      <div className="hidden lg:contents">{children}</div>
      {/* Mobile/tablet: show message */}
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background p-8 lg:hidden">
        <Monitor className="h-12 w-12 text-muted-foreground" />
        <p className="text-center text-sm text-muted-foreground">
          A Análise Conversacional está disponível apenas em desktop.<br />
          Por favor, acesse em uma tela maior (min. 1024px).
        </p>
      </div>
    </>
  );
}

export function ExplorePage() {
  return (
    <ProtectedRoute>
      <DataProvider>
        <DesktopOnlyGate>
          <div className="flex h-screen flex-col bg-background">
            <CanvasHeader />
            <div className="flex flex-1 overflow-hidden">
              {/* Main panel ~75% */}
              <main className="flex-1 overflow-hidden">
                <CanvasPanel />
              </main>
              {/* Chat sidebar ~25% */}
              <aside className="w-[360px] shrink-0">
                <CanvasChat />
              </aside>
            </div>
          </div>
        </DesktopOnlyGate>
      </DataProvider>
    </ProtectedRoute>
  );
}
```

- [ ] **Step 2: Create route page**

```typescript
// app/explore/page.tsx
import { ExplorePage } from '@/pages/explore/ui/ExplorePage';

export default function Explore() {
  return <ExplorePage />;
}
```

- [ ] **Step 3: Verify page loads in browser**

Run: `pnpm dev` then navigate to `http://localhost:3000/explore`
Expected: See the immersive layout with empty panel and chat sidebar.

- [ ] **Step 4: Commit**

```bash
git add src/pages/explore/ui/ExplorePage.tsx app/explore/page.tsx
git commit -m "feat: add /explore route with immersive layout"
```

---

## Task 9: Update Landing Page

**Files:**
- Modify: `src/pages/landing/ui/LandingPage.tsx`

- [ ] **Step 1: Add Análise Conversacional card to landing page**

The existing `LandingPage.tsx` is a large component with hero section, agent cards, KPI previews, etc. Add a new "mode selection" section near the top, after the hero, with two cards: one for the existing dashboard and one for the new immersive explore mode.

Find the main content area (after the hero/navbar section) and add a mode selection section. The exact insertion point depends on the current component structure — look for the hero section and add the cards right after it.

Add this section component inside the file:

```typescript
function ModeSelector() {
  return (
    <section className="relative z-10 mx-auto max-w-5xl px-6 py-16">
      <h2 className="mb-2 text-center text-2xl font-bold text-white">
        Como você quer explorar?
      </h2>
      <p className="mb-8 text-center text-sm text-zinc-400">
        Escolha o modo de análise que melhor se adapta à sua necessidade
      </p>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Link
          href="/dashboard"
          className="group relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8 transition-all hover:border-zinc-600 hover:bg-zinc-900/80"
        >
          <BarChart3 className="mb-4 h-10 w-10 text-[#F3A169]" />
          <h3 className="mb-2 text-lg font-semibold text-white">Dashboard Tradicional</h3>
          <p className="text-sm leading-relaxed text-zinc-400">
            Navegue por páginas de indicadores pré-configurados com filtros avançados, comparação de períodos e análise assistida por IA.
          </p>
          <ArrowRight className="mt-4 h-5 w-5 text-zinc-500 transition-transform group-hover:translate-x-1 group-hover:text-white" />
        </Link>
        <Link
          href="/explore"
          className="group relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8 transition-all hover:border-primary/50 hover:bg-zinc-900/80"
        >
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/5 blur-2xl transition-all group-hover:bg-primary/10" />
          <Sparkles className="mb-4 h-10 w-10 text-primary" />
          <h3 className="mb-2 text-lg font-semibold text-white">Análise Conversacional</h3>
          <p className="text-sm leading-relaxed text-zinc-400">
            Converse com a IA e ela constrói dashboards personalizados em tempo real. Pergunte sobre risco, repasse, inadimplência — a IA planeja e visualiza.
          </p>
          <ArrowRight className="mt-4 h-5 w-5 text-zinc-500 transition-transform group-hover:translate-x-1 group-hover:text-primary" />
          <span className="mt-3 inline-block rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            Novo
          </span>
        </Link>
      </div>
    </section>
  );
}
```

Then render `<ModeSelector />` after the hero section in the main component.

- [ ] **Step 2: Verify landing page renders with both cards**

Navigate to `http://localhost:3000` — confirm both cards appear and link to `/dashboard` and `/explore`.

- [ ] **Step 3: Commit**

```bash
git add src/pages/landing/ui/LandingPage.tsx
git commit -m "feat: add mode selection to landing page (dashboard + conversational analysis)"
```

---

## Task 10: Integration Test — End-to-End Flow

- [ ] **Step 1: Verify build succeeds**

Run: `pnpm build 2>&1 | tail -20`
Expected: Build succeeds with no errors.

- [ ] **Step 2: Manual smoke test**

1. Navigate to `http://localhost:3000` → see landing page with two mode cards
2. Click "Análise Conversacional" → navigate to `/explore`
3. See immersive layout: header, empty panel with welcome message, chat sidebar
4. Type "Quero analisar a visão geral da minha carteira" in chat
5. Observe: AI plans, creates page tab, adds blocks progressively
6. Blocks (KPIs, charts, text) appear in the panel
7. Continue conversation: "Detalhe a inadimplência"
8. New tab may appear or new blocks added to existing page

- [ ] **Step 3: Fix any issues found during smoke test**

Iterate on any rendering, streaming, or data issues.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "fix: integration fixes from smoke test"
```

---

## Task Dependency Graph

```
Task 1 (Auth extraction)
    │
    ├──► Task 2 (Types + Store)
    │        │
    │        ├──► Task 3 (Tools) ──► Task 4 (Orchestrator) ──► Task 5 (API endpoint)
    │        │
    │        └──► Task 6 (Block renderers) ──► Task 7 (Layout components) ──► Task 8 (Route)
    │
    └──► Task 9 (Landing page) — independent, can run in parallel with Tasks 3-8

Task 10 (Integration) — depends on all above
```

**Parallelizable:** Tasks 3-4-5 (backend) can run in parallel with Tasks 6-7-8 (frontend). Task 9 is independent.
