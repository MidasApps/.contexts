# Sprint 1.B — Parallel Fill Blocks + Telemetry Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extrair `fill_block` para função pura `fillBlock(slot, ctx, signal)` e expor paralelização determinística via nova tool `fill_layout` que usa `p-limit(3)` + `Promise.allSettled` reusando `withRetry` existente. Instrumentar telemetry baseline (p50/p95 wall-clock + tokens) via `experimental_telemetry` do AI SDK + `recordSpan` próprio. **Hipótese a validar (não promessa):** mover orquestração de slots para código TS reduz variância de latência e habilita retry granular/error handling estruturado em builds com ≥4 blocos. KPI a medir antes/depois via Task 10.

**Architecture:** Sem state-machine ainda (Sprint 2). O AI SDK já permite tool calls paralelas no mesmo step — porém a garantia disso é probabilística (depende do prompt) e a lógica de fill vive dentro do loop do modelo, sem `Promise.allSettled` determinístico nem retry granular por slot. Esta sprint isola `fillBlock` da árvore de tools e expõe `fill_layout` (batch determinístico) sem remover `fill_block`. Mantém supervisor conversacional intacto. Telemetry: `experimental_telemetry` do AI SDK (OTel) + `recordSpan` (wrapper próprio sobre OpenTelemetry) emitindo NDJSON para Cloud Logging.

**Tech Stack:** Vitest 4.x (instalado na Sprint 1.A — apenas USAR), p-limit 6.x (ESM-only), AI SDK v6 (`experimental_telemetry` §4.17 do ADR), `withRetry` existente em `src/features/ai-agents/lib/with-retry.ts` (reuso, NÃO reinventar).

---

## Context

Plano-fonte: `docs/superpowers/plans/2026-05-04-mastra-workflows-network.md` §4 (Concorrência/retry/cancelamento) e §6 Fase 1.

Codebase atual relevante:

- `src/features/canvas-orchestrator/tools/fill-block.ts` (170 LOC) — hoje é um `tool({...async *execute({slotId, intent, targetType, agentType, pageIndex}){...}})` que monta system prompt do sub-agente, chama `generateText` com tools especializadas, extrai resultado de `submit_data`, converte para bloco e yielda `loading`/`ready`/`error`. Já usa `withRetry` em volta de `generateText` (linha 124). Já tem `AbortSignal.timeout(30_000)` interno.
- `src/features/canvas-orchestrator/orchestrator.ts:74` — registra `fill_block: createFillBlockTool(ctx)`.
- `src/features/ai-agents/lib/with-retry.ts` — `withRetry(fn, {maxRetries=3, baseDelay=500, label})` com backoff exponencial em 429/503/`quota`. Reuse direto.
- `src/features/canvas-orchestrator/lib/sub-agent.ts` — `AGENT_TYPE`, `PROMPT_BUILDERS`, `buildToolsForAgent` consumido por fill-block.
- `src/features/canvas-orchestrator/tools/submit-block-data.ts` — `SUBMIT_TOOLS` map por target type.
- `src/shared/config/agents/types.ts` — local correto para o novo type `FillBlockResult`.
- `src/shared/config/agents/canvas-orchestrator.ts` — `buildCanvasOrchestratorPrompt` (atualizar regras de uso de tools).

**Importante:** a tool `fill_block` continua existindo (o supervisor a chama do mesmo jeito hoje). A **nova tool `fill_layout`** (singular) recebe um array de slots e paraleliza interno via `pLimit(3) + Promise.allSettled`, com retry granular por slot via `withRetry` reutilizado dentro de `fillBlock`. Após `declare_layout`, o supervisor passa a chamar `fill_layout` UMA VEZ em vez de `fill_block` N vezes. `fill_block` permanece para retry pontual de 1 slot e compatibilidade. **Multi-tenancy:** `AgentDynamicContext` hoje carrega `dataset`, `filters`, `sessionId`, `page` (não há ainda campo `clientId` dedicado — `dataset` faz o papel implícito por cliente). Esta sprint propaga o `ctx` inteiro a cada chamada de `fillBlock` sem alterar a forma; introdução de `clientId` explícito + falha-fechada é responsabilidade da Sprint 1.A/2 conforme §4 do plano-fonte. Não usar globals para tenant.

---

## File Structure

```
src/
├── features/
│   ├── canvas-orchestrator/
│   │   ├── lib/
│   │   │   ├── fill-block-fn.ts                  # NEW - função pura fillBlock()
│   │   │   ├── fill-block-fn.test.ts             # NEW
│   │   │   ├── fill-layout-parallel.ts           # NEW - pLimit + allSettled
│   │   │   ├── fill-layout-parallel.test.ts      # NEW
│   │   │   └── sub-agent.ts                      # (existing, leitura)
│   │   ├── tools/
│   │   │   ├── fill-block.ts                     # MODIFY - delega ao fillBlock puro
│   │   │   ├── fill-block.test.ts                # NEW (regressão)
│   │   │   ├── fill-layout.ts                    # NEW - tool batch
│   │   │   ├── fill-layout.test.ts               # NEW
│   │   │   └── submit-block-data.ts              # (existing)
│   │   └── orchestrator.ts                       # MODIFY - registra fill_layout + telemetry
│   └── ai-agents/
│       └── lib/with-retry.ts                     # (existing, reuse)
├── shared/
│   ├── config/
│   │   └── agents/
│   │       ├── types.ts                          # MODIFY - add FillBlockResult, SlotSpec
│   │       └── canvas-orchestrator.ts            # MODIFY - prompt instrui fill_layout
│   └── lib/
│       └── telemetry/
│           ├── record-span.ts                    # NEW
│           └── record-span.test.ts               # NEW
scripts/
└── measure-fill-baseline.ts                      # NEW
docs/superpowers/plans/
└── 2026-05-04-sprint1-B-acceptance.md            # NEW (Task 12)
```

---

## Tasks

### Task 1: Instalar p-limit

- [ ] **Step 1.1:** Instalar dependência.
  ```bash
  pnpm add p-limit@^6
  ```
- [ ] **Step 1.2:** Verificar `package.json` contém `"p-limit": "^6.x"` em `dependencies`.
- [ ] **Step 1.3:** Smoke local — `node -e "import('p-limit').then(m=>console.log(typeof m.default))"` deve imprimir `function`.
- [ ] **Step 1.4:** Commit: `chore(deps): add p-limit@^6 for parallel fill orchestration`.

---

### Task 2: Extrair `fillBlock` puro

**Files:** `src/features/canvas-orchestrator/lib/fill-block-fn.ts` (new), `src/features/canvas-orchestrator/lib/fill-block-fn.test.ts` (new).

- [ ] **Step 2.1 (RED — test):** Escrever `fill-block-fn.test.ts` com:
  - Mock `vi.mock('ai', () => ({ generateText: vi.fn(), tool: (x:any)=>x, stepCountIs: ()=>({}) }))`.
  - Mock `vi.mock('@/features/ai-agents/model-registry', () => ({ getModel: () => ({}) }))`.
  - Mock `../tools/submit-block-data` para devolver `SUBMIT_TOOLS` deterministico.
  - Mock `./sub-agent` — `PROMPT_BUILDERS.financial_analyst = () => 'sys'`, `buildToolsForAgent = () => ({})`, `AGENT_TYPE` = z.enum minimal.
  - Caso 1 (success): `generateText` resolve com `steps: [{toolResults:[{toolName:'submit_data', output:{label:'X', value:'10'}}]}]`. Esperar `result.status === 'success'`, `result.block.id === slotId`, `result.block.type === 'kpi'`.
  - Caso 2 (no submit): `generateText` resolve sem `submit_data` em toolResults. Esperar `result.status === 'error'` e `result.error` contém "Não foi possível gerar".
  - Caso 3 (transient retry): `generateText` rejeita 1× com `Error('429 quota')`, 2× sucesso. `withRetry` real (não mockar). Esperar `status === 'success'` e `generateText` chamado 2×.
  - Caso 4 (abort): `signal.abort()` antes de chamar `fillBlock`. Esperar `status === 'error'` com `error` contendo "Tempo esgotado" OU lançar `AbortError` capturado e mapeado.
  - Verificar testes falham: `pnpm test:run src/features/canvas-orchestrator/lib/fill-block-fn.test.ts`.
- [ ] **Step 2.2 (GREEN):** Criar `fill-block-fn.ts`:
  ```typescript
  import { generateText, stepCountIs } from 'ai';
  import { getModel } from '@/features/ai-agents/model-registry';
  import { withRetry } from '@/features/ai-agents/lib/with-retry';
  import type { AgentDynamicContext, FillBlockResult, SlotSpec } from '@/shared/config/agents/types';
  import type { ToolContext } from '@/features/ai-agents/tools/tool-context';
  import { PROMPT_BUILDERS, buildToolsForAgent } from './sub-agent';
  import { SUBMIT_TOOLS } from '../tools/submit-block-data';
  import { buildFillPrompt, convertToBlock } from '../tools/fill-block-internals';

  export interface FillBlockArgs {
    slot: SlotSpec;
    ctx: AgentDynamicContext;
    signal?: AbortSignal;
  }

  export async function fillBlock(args: FillBlockArgs): Promise<FillBlockResult> {
    const { slot, ctx, signal } = args;
    const { slotId, pageIndex, targetType, intent, agentType } = slot;

    const buildPrompt = PROMPT_BUILDERS[agentType];
    const system = `${buildPrompt(ctx)}\n\n---\n\n${buildFillPrompt(targetType, intent, ctx)}`;
    const toolCtx: ToolContext = { dataset: ctx.dataset, filters: ctx.filters, sessionId: ctx.sessionId };
    const agentTools = buildToolsForAgent(agentType, toolCtx, ctx);
    const submitTools = SUBMIT_TOOLS[targetType];
    const timeoutSignal = AbortSignal.timeout(30_000);
    const composed = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

    try {
      const result = await withRetry(
        () => generateText({
          model: getModel('fast'),
          system,
          prompt: intent,
          tools: { ...agentTools, ...submitTools },
          stopWhen: stepCountIs(8),
          abortSignal: composed,
        }),
        { label: `fill_block:${slotId}` },
      );

      const submitResult = result.steps
        .flatMap(s => s.toolResults)
        .find(tr => tr.toolName === 'submit_data');

      if (submitResult?.output && typeof submitResult.output === 'object') {
        const block = convertToBlock(targetType, slotId, submitResult.output as Record<string, unknown>);
        return { slotId, pageIndex, status: 'success', block };
      }

      const shortIntent = intent.length > 80 ? intent.slice(0, 77) + '...' : intent;
      return { slotId, pageIndex, status: 'error', error: `Não foi possível gerar "${shortIntent}". Tente reformular com menos variáveis.` };
    } catch (error) {
      const shortIntent = intent.length > 60 ? intent.slice(0, 57) + '...' : intent;
      const isTimeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      return {
        slotId,
        pageIndex,
        status: 'error',
        error: isTimeout
          ? `Tempo esgotado ao gerar "${shortIntent}". Tente simplificar a consulta.`
          : `Erro ao gerar "${shortIntent}": ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
      };
    }
  }
  ```
- [ ] **Step 2.3:** Extrair `buildFillPrompt` e `convertToBlock` de `tools/fill-block.ts` para um novo arquivo `tools/fill-block-internals.ts` (export both). Ainda não tocar `tools/fill-block.ts`.
- [ ] **Step 2.4 (verify):** `pnpm test:run src/features/canvas-orchestrator/lib/fill-block-fn.test.ts` verde.
- [ ] **Step 2.5:** Commit: `feat(canvas): extract pure fillBlock() function for parallel execution`.

---

### Task 3: Tipos `FillBlockResult` e `SlotSpec`

**Files:** `src/shared/config/agents/types.ts` (modify).

- [ ] **Step 3.1:** Ler `src/shared/config/agents/types.ts` e localizar a região onde `AgentDynamicContext` é declarado.
- [ ] **Step 3.2:** Adicionar (no final do arquivo, mantendo style existente):
  ```typescript
  export interface SlotSpec {
    slotId: string;
    pageIndex: number;
    targetType: 'kpi' | 'chart' | 'table' | 'text';
    intent: string;
    agentType: 'financial_analyst' | 'data_engineer' | 'risk_analyst' | 'report_writer';
  }

  export type FillBlockResult =
    | { slotId: string; pageIndex: number; status: 'success'; block: SingleKpiBlock | ChartBlock | TableBlock | TextBlock }
    | { slotId: string; pageIndex: number; status: 'error'; error: string }
    | { slotId: string; pageIndex: number; status: 'aborted' };
  ```
  Ajustar a union `agentType` para o que `AGENT_TYPE` enum já define em `sub-agent.ts` — ler primeiro e copiar literais.
- [ ] **Step 3.3 (test):** `src/shared/config/agents/types.test.ts` opcional, type-only:
  ```typescript
  import { expectTypeOf } from 'vitest';
  import type { FillBlockResult, SlotSpec } from './types';
  test('FillBlockResult discriminates by status', () => {
    const r: FillBlockResult = { slotId:'s1', pageIndex:0, status:'success', block: { id:'s1', type:'kpi', label:'x', value:'1' } as any };
    if (r.status === 'success') expectTypeOf(r.block).toBeObject();
  });
  ```
- [ ] **Step 3.4:** `pnpm tsc --noEmit` verde.
- [ ] **Step 3.5:** Commit: `feat(types): add FillBlockResult and SlotSpec for parallel fill orchestration`.

---

### Task 4: `fillLayoutParallel` com p-limit + Promise.allSettled

**Files:** `src/features/canvas-orchestrator/lib/fill-layout-parallel.ts` (new), `…/fill-layout-parallel.test.ts` (new).

- [ ] **Step 4.1 (RED):** Escrever testes:
  - **Test A — happy path:** 6 slots, mock `fillBlock` para retornar `{status:'success'}` em 50ms cada. Assert `successCount === 6`, `errorCount === 0`, `results.length === 6`. Tempo total ≥ 100ms (2 batches de 3) e ≤ 250ms.
  - **Test B — partial failure:** 6 slots, mock alterna success/error. `successCount === 3`, `errorCount === 3`, `results` mantém ordem de entrada por `slotId`.
  - **Test C — abort mid-flight:** 8 slots, `concurrency=3`. Disparar `controller.abort()` após 60ms. Esperar resultados com pelo menos 3 `success` e os restantes com `status:'aborted'`. Total não passa de 200ms (sem aguardar timeout interno).
  - **Test D — concurrency=1 force:** 4 slots com delay 50ms. Tempo total ≥ 200ms (sequencial).
  - **Test E — env override:** `process.env.FILL_LAYOUT_CONCURRENCY='2'` força concurrency=2 quando `concurrency` não é passado.
  - Mock `./fill-block-fn` via `vi.mock`.
- [ ] **Step 4.2 (GREEN):** Implementar:
  ```typescript
  import pLimit from 'p-limit';
  import { fillBlock } from './fill-block-fn';
  import type { AgentDynamicContext, FillBlockResult, SlotSpec } from '@/shared/config/agents/types';

  export interface FillLayoutResult {
    results: FillBlockResult[];
    successCount: number;
    errorCount: number;
    abortedCount: number;
    durationMs: number;
  }

  function resolveConcurrency(explicit?: number): number {
    if (explicit && explicit > 0) return explicit;
    const env = Number(process.env.FILL_LAYOUT_CONCURRENCY);
    return Number.isFinite(env) && env > 0 ? env : 3;
  }

  export async function fillLayoutParallel(
    slots: SlotSpec[],
    ctx: AgentDynamicContext,
    signal?: AbortSignal,
    options: { concurrency?: number } = {},
  ): Promise<FillLayoutResult> {
    const concurrency = resolveConcurrency(options.concurrency);
    const limit = pLimit(concurrency);
    const start = performance.now();

    const tasks = slots.map(slot =>
      limit(async (): Promise<FillBlockResult> => {
        if (signal?.aborted) {
          return { slotId: slot.slotId, pageIndex: slot.pageIndex, status: 'aborted' };
        }
        return fillBlock({ slot, ctx, signal });
      }),
    );

    const settled = await Promise.allSettled(tasks);
    const results: FillBlockResult[] = settled.map((s, i) => {
      if (s.status === 'fulfilled') return s.value;
      const slot = slots[i];
      return { slotId: slot.slotId, pageIndex: slot.pageIndex, status: 'error', error: s.reason?.message ?? 'unknown' };
    });

    const successCount = results.filter(r => r.status === 'success').length;
    const errorCount = results.filter(r => r.status === 'error').length;
    const abortedCount = results.filter(r => r.status === 'aborted').length;
    return { results, successCount, errorCount, abortedCount, durationMs: performance.now() - start };
  }
  ```
- [ ] **Step 4.3 (verify):** `pnpm test:run src/features/canvas-orchestrator/lib/fill-layout-parallel.test.ts` verde, todos 5 testes.
- [ ] **Step 4.4:** Commit: `feat(canvas): add fillLayoutParallel with p-limit(3) + Promise.allSettled`.

---

### Task 5: Nova tool `fill_layout` (batch)

**Files:** `src/features/canvas-orchestrator/tools/fill-layout.ts` (new), `…/fill-layout.test.ts` (new).

- [ ] **Step 5.1 (RED):** Testes:
  - Importar `createFillLayoutTool`. Mock `../lib/fill-layout-parallel` para retornar resultado fixo.
  - **Test A — schema:** chamar com `{slots:[]}` deve falhar validação Zod (`min(1)`).
  - **Test B — yields:** com 3 slots e mock que resolve cada após 10ms (usar fake timers ou queue), executar tool e coletar yields. Esperar:
    1. yield inicial `{ status: 'fill_layout_started', slotCount: 3 }`
    2. 3 yields `{ status: 'slot_done', slotId, result }` em ordem de conclusão
    3. yield final `{ status: 'fill_layout_complete', successCount, errorCount }`
  - **Test C — abort propagation:** passar `abortSignal` cancelado, verificar yield final `abortedCount === 3`.
- [ ] **Step 5.2 (GREEN):** Implementar:
  ```typescript
  import { tool } from 'ai';
  import { z } from 'zod';
  import { fillLayoutParallel } from '../lib/fill-layout-parallel';
  import { recordSpan } from '@/shared/lib/telemetry/record-span';
  import { fillBlock } from '../lib/fill-block-fn';
  import pLimit from 'p-limit';
  import type { AgentDynamicContext } from '@/shared/config/agents/types';

  const SLOT_SCHEMA = z.object({
    slotId: z.string(),
    pageIndex: z.number(),
    targetType: z.enum(['kpi','chart','table','text']),
    intent: z.string(),
    agentType: z.enum(['financial_analyst','data_engineer','risk_analyst','report_writer']),
  });

  export function createFillLayoutTool(ctx: AgentDynamicContext) {
    return tool({
      description: 'Preenche TODOS os slots declarados em paralelo. Use UMA VEZ após declare_layout.',
      inputSchema: z.object({ slots: z.array(SLOT_SCHEMA).min(1).max(20) }),
      async *execute({ slots }, { abortSignal }) {
        yield { status: 'fill_layout_started' as const, slotCount: slots.length };

        // Stream individual slot completions while tasks run.
        const concurrency = Number(process.env.FILL_LAYOUT_CONCURRENCY) || 3;
        const limit = pLimit(concurrency);
        const start = performance.now();
        const queue: Array<{ slotId: string; result: Awaited<ReturnType<typeof fillBlock>> }> = [];
        let resolveNext: (() => void) | null = null;

        const tasks = slots.map(slot =>
          limit(async () => {
            if (abortSignal?.aborted) {
              const aborted = { slotId: slot.slotId, pageIndex: slot.pageIndex, status: 'aborted' as const };
              queue.push({ slotId: slot.slotId, result: aborted });
              resolveNext?.();
              return aborted;
            }
            const r = await fillBlock({ slot, ctx, signal: abortSignal });
            queue.push({ slotId: slot.slotId, result: r });
            resolveNext?.();
            return r;
          }),
        );

        const all = Promise.allSettled(tasks);
        let done = 0;
        while (done < slots.length) {
          if (queue.length === 0) {
            await new Promise<void>(r => { resolveNext = r; });
            resolveNext = null;
          }
          while (queue.length > 0) {
            const item = queue.shift()!;
            done++;
            yield { status: 'slot_done' as const, slotId: item.slotId, result: item.result };
          }
        }
        const settled = await all;
        const results = settled.map(s => s.status === 'fulfilled' ? s.value : { slotId:'?', pageIndex:0, status:'error' as const, error:'rejected' });
        const successCount = results.filter(r => r.status === 'success').length;
        const errorCount = results.filter(r => r.status === 'error').length;
        const abortedCount = results.filter(r => r.status === 'aborted').length;
        yield {
          status: 'fill_layout_complete' as const,
          successCount, errorCount, abortedCount,
          durationMs: performance.now() - start,
        };
      },
    });
  }
  ```
- [ ] **Step 5.3 (verify):** Tests verdes.
- [ ] **Step 5.4:** Commit: `feat(canvas): add fill_layout batch tool that parallelizes slot fills`.

---

### Task 6: Registrar `fill_layout` no Canvas Orchestrator + atualizar prompt

**Files:** `src/features/canvas-orchestrator/orchestrator.ts` (modify), `src/shared/config/agents/canvas-orchestrator.ts` (modify).

- [ ] **Step 6.1:** Em `orchestrator.ts`:
  - Adicionar import: `import { createFillLayoutTool } from './tools/fill-layout';`
  - No objeto `tools`, após `fill_block: createFillBlockTool(ctx),` adicionar:
    ```typescript
    fill_layout: createFillLayoutTool(ctx),
    ```
  - **NÃO** remover `fill_block` (deprecação só na Sprint 2).
- [ ] **Step 6.2:** Localizar `buildCanvasOrchestratorPrompt` em `src/shared/config/agents/canvas-orchestrator.ts` (use grep se necessário). Identificar a seção que documenta `declare_layout` + `fill_block`. Adicionar o seguinte parágrafo logo após a documentação de `declare_layout`:
  ```
  ### Preenchimento em lote (RECOMENDADO)
  **Após `declare_layout`, prefira chamar `fill_layout` UMA VEZ com TODOS os slots em vez de chamar `fill_block` N vezes.** `fill_layout` paraleliza internamente até 3 slots por vez (`Promise.allSettled` para sucesso parcial), garantindo retry granular e error handling estruturado por slot. Ganho de wall-clock é hipótese a medir (Task 10), não promessa fechada. Use `fill_block` apenas para retry pontual de UM slot que falhou.

  Exemplo correto:
  declare_layout({ pages:[...] }) → fill_layout({ slots:[s1,s2,s3,s4,s5,s6] })

  Exemplo a EVITAR:
  declare_layout(...) → fill_block(s1) → fill_block(s2) → fill_block(s3)...
  ```
- [ ] **Step 6.3 (smoke):** `pnpm tsc --noEmit` verde. Rodar `pnpm dev`, abrir chat, pedir "monte um dashboard com 6 KPIs de inadimplência". Confirmar via logs do servidor que aparece `fill_layout_started slotCount=6`.
- [ ] **Step 6.4:** Commit: `feat(canvas): register fill_layout tool and update orchestrator prompt`.

---

### Task 7: Telemetria — wrapper `recordSpan`

**Files:** `src/shared/lib/telemetry/record-span.ts` (new), `…/record-span.test.ts` (new).

- [ ] **Step 7.1 (RED):** Testes:
  - **Test A — happy:** `recordSpan({name:'op', attributes:{a:1}}, async()=>'val')` retorna `'val'`. Spy em `console.log` recebe 1 chamada com JSON parseável contendo `event:'span'`, `name:'op'`, `durationMs:>=0`, `attributes:{a:1}`, `ts:string`, `status:'ok'`.
  - **Test B — error:** fn que lança `Error('boom')`. `recordSpan` rethrow. Log contém `status:'error'` e `error:'boom'`.
  - **Test C — sync return:** aceita `() => 42` (sync) ou `async`. Ambos funcionam.
- [ ] **Step 7.2 (GREEN):** Implementar:
  ```typescript
  export interface SpanOptions {
    name: string;
    attributes?: Record<string, unknown>;
  }

  export async function recordSpan<T>(opts: SpanOptions, fn: () => T | Promise<T>): Promise<T> {
    const start = performance.now();
    const ts = new Date().toISOString();
    try {
      const result = await fn();
      console.log(JSON.stringify({
        event: 'span',
        name: opts.name,
        status: 'ok',
        durationMs: +(performance.now() - start).toFixed(2),
        attributes: opts.attributes ?? {},
        ts,
      }));
      return result;
    } catch (err) {
      console.log(JSON.stringify({
        event: 'span',
        name: opts.name,
        status: 'error',
        durationMs: +(performance.now() - start).toFixed(2),
        attributes: opts.attributes ?? {},
        error: err instanceof Error ? err.message : String(err),
        ts,
      }));
      throw err;
    }
  }
  ```
- [ ] **Step 7.3 (verify):** Tests verdes.
- [ ] **Step 7.4:** Commit: `feat(telemetry): add recordSpan helper for structured wall-clock logging`.

---

### Task 8: Instrumentar `experimental_telemetry` no canvas streamText

**Files:** `src/features/canvas-orchestrator/orchestrator.ts` (modify).

- [ ] **Step 8.1:** Em `orchestrator.ts:43`, modificar a chamada `streamText({...})` adicionando, antes de `messages:`:
  ```typescript
  experimental_telemetry: {
    isEnabled: true,
    functionId: 'canvas-orchestrator',
    metadata: {
      sessionId,
      dataset: input.dataset,
      pagesCount: input.pagesContext.length,
    },
  },
  ```
- [ ] **Step 8.2:** Verificar tipagem do AI SDK v6 — se `experimental_telemetry` exigir `tracer` providenciado, o default no-op é aceitável; em prod o adapter Vertex já envia traces para Cloud Trace via OTel se configurado. Documentar limitação no commit msg.
- [ ] **Step 8.3 (smoke):** `pnpm dev`, abrir chat, fazer 1 pergunta. No console do servidor procurar linhas com `ai.usage.inputTokens`, `ai.usage.outputTokens`. Se OTel não estiver configurado, AI SDK ainda retorna usage no `result.usage` — confirmar que pelo menos `usage` aparece.
- [ ] **Step 8.4:** Commit: `feat(telemetry): enable experimental_telemetry on canvas streamText`.

---

### Task 9: Instrumentar `recordSpan` em `fillLayoutParallel` e `fillBlock`

**Files:** `src/features/canvas-orchestrator/lib/fill-layout-parallel.ts` (modify), `src/features/canvas-orchestrator/lib/fill-block-fn.ts` (modify), tests correspondentes.

- [ ] **Step 9.1 (RED):** Em `fill-layout-parallel.test.ts` adicionar:
  - Spy `console.log`. Após `fillLayoutParallel(6 slots)`, esperar entre os logs:
    - 1 log com `name:'fill_layout_total'` e `attributes:{slotCount:6, concurrency:3, successCount, errorCount}`.
    - 6 logs com `name` matchando `/^fill_layout_slot_/` cada com `attributes.slotId`.
- [ ] **Step 9.2 (GREEN):** Wrapping em `fillLayoutParallel`:
  ```typescript
  return recordSpan(
    { name: 'fill_layout_total', attributes: { slotCount: slots.length, concurrency } },
    async () => {
      // existing tasks/allSettled body, mas envolver cada limit(...) com recordSpan('fill_layout_slot_'+slot.slotId, {slotId, targetType})
      ...
    },
  );
  ```
  Em `fill-block-fn.ts` (opcional, mas útil): envolver o `withRetry(...)` chamada com `recordSpan({name:'fill_block_inner', attributes:{slotId, targetType}}, () => withRetry(...))`.
- [ ] **Step 9.3 (verify):** Testes verdes (incluindo os antigos — atributos extras no log não quebram).
- [ ] **Step 9.4:** Commit: `feat(telemetry): wrap fillLayoutParallel and fillBlock with recordSpan`.

---

### Task 10: Métricas baseline — script de medição

**Files:** `scripts/measure-fill-baseline.ts` (new).

- [ ] **Step 10.1:** Criar script que aceita arquivo NDJSON via argv ou stdin:
  ```typescript
  #!/usr/bin/env node
  import { readFileSync } from 'node:fs';

  interface Span { event:string; name:string; durationMs:number; attributes?:Record<string,unknown>; status?:string }

  function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
    return sorted[idx];
  }

  function main() {
    const path = process.argv[2];
    if (!path) {
      console.error('Usage: pnpm tsx scripts/measure-fill-baseline.ts <log.ndjson>');
      process.exit(1);
    }
    const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
    const spans: Span[] = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.event === 'span' && parsed.name === 'fill_layout_total') spans.push(parsed);
      } catch { /* skip */ }
    }
    const byCount = new Map<number, number[]>();
    for (const s of spans) {
      const n = (s.attributes as { slotCount?: number })?.slotCount ?? 0;
      if (!byCount.has(n)) byCount.set(n, []);
      byCount.get(n)!.push(s.durationMs);
    }

    console.log('| slotCount | samples | p50 (ms) | p95 (ms) | p99 (ms) |');
    console.log('|-----------|---------|----------|----------|----------|');
    for (const [n, durs] of [...byCount.entries()].sort((a,b)=>a[0]-b[0])) {
      const sorted = [...durs].sort((a,b)=>a-b);
      console.log(`| ${n} | ${durs.length} | ${percentile(sorted,0.5).toFixed(0)} | ${percentile(sorted,0.95).toFixed(0)} | ${percentile(sorted,0.99).toFixed(0)} |`);
    }
  }

  main();
  ```
- [ ] **Step 10.2 (smoke):** Gerar log fake `echo '{"event":"span","name":"fill_layout_total","durationMs":1234,"attributes":{"slotCount":6}}' > /tmp/fake.ndjson` (3-4 linhas) e rodar `pnpm tsx scripts/measure-fill-baseline.ts /tmp/fake.ndjson`. Tabela markdown impressa.
- [ ] **Step 10.3:** Commit: `feat(scripts): add measure-fill-baseline percentile aggregator`.

---

### Task 11: Atualizar `fill_block` existente para reusar `fillBlock` puro

**Files:** `src/features/canvas-orchestrator/tools/fill-block.ts` (modify), `…/fill-block.test.ts` (new — regressão).

- [ ] **Step 11.1 (RED — regression test):** Criar `tools/fill-block.test.ts`:
  - Mock `../lib/fill-block-fn` para retornar `{slotId:'s1', pageIndex:0, status:'success', block:{id:'s1', type:'kpi', label:'L', value:'V'}}`.
  - Instanciar `createFillBlockTool(ctx)`, executar `tool.execute({slotId, pageIndex, targetType:'kpi', intent:'x', agentType:'financial_analyst'})` e coletar yields.
  - Esperar primeiro yield `{status:'loading', slotId:'s1', pageIndex:0}` e segundo `{status:'ready', slotId:'s1', pageIndex:0, block:{...}}`.
  - Caso erro: mock retorna `{status:'error', error:'boom'}` → segundo yield `{status:'error', slotId, pageIndex, error:'boom'}`.
- [ ] **Step 11.2 (GREEN):** Reescrever `createFillBlockTool` (arquivo atual lido em contexto):
  ```typescript
  import { tool } from 'ai';
  import { z } from 'zod';
  import { AGENT_TYPE } from '../lib/sub-agent';
  import { fillBlock } from '../lib/fill-block-fn';
  import type { AgentDynamicContext } from '@/shared/config/agents/types';

  export function createFillBlockTool(ctx: AgentDynamicContext) {
    return tool({
      description: 'Preenche UM slot. Para múltiplos, prefira fill_layout (paraleliza).',
      inputSchema: z.object({
        slotId: z.string(),
        pageIndex: z.number(),
        targetType: z.enum(['kpi','chart','table','text']),
        intent: z.string(),
        agentType: AGENT_TYPE,
      }),
      async *execute(input, { abortSignal }) {
        yield { status: 'loading' as const, slotId: input.slotId, pageIndex: input.pageIndex };
        const r = await fillBlock({ slot: input, ctx, signal: abortSignal });
        if (r.status === 'success') {
          yield { status: 'ready' as const, slotId: r.slotId, pageIndex: r.pageIndex, block: r.block };
        } else if (r.status === 'aborted') {
          yield { status: 'error' as const, slotId: r.slotId, pageIndex: r.pageIndex, error: 'Cancelado' };
        } else {
          yield { status: 'error' as const, slotId: r.slotId, pageIndex: r.pageIndex, error: r.error };
        }
      },
    });
  }
  ```
- [ ] **Step 11.3:** Garantir que `buildFillPrompt`/`convertToBlock` ficaram em `tools/fill-block-internals.ts` (Task 2). Remover do `tools/fill-block.ts` se ainda existirem.
- [ ] **Step 11.4 (verify):** `pnpm test:run src/features/canvas-orchestrator/tools/fill-block.test.ts` verde. `pnpm tsc --noEmit` verde.
- [ ] **Step 11.5:** Commit: `refactor(canvas): fill_block tool delegates to pure fillBlock()`.

---

### Task 12: Documentar nova capacidade + acceptance

**Files:** `docs/superpowers/plans/2026-05-04-sprint1-B-acceptance.md` (new).

- [ ] **Step 12.1:** Criar arquivo com seções:
  - **Smoke steps:** (a) `pnpm dev`, (b) abrir chat no `/explore`, (c) pedir dashboard de 6 KPIs, (d) confirmar 1 chamada de `fill_layout` nos logs (não 6× `fill_block`), (e) repetir 10× e capturar logs em `/tmp/canvas.ndjson` via `pnpm dev 2>&1 | tee /tmp/canvas.ndjson`, (f) rodar `pnpm tsx scripts/measure-fill-baseline.ts /tmp/canvas.ndjson`.
  - **Baseline coletada:** tabela em branco para preencher após execução (slotCount 4/6/8/10, p50/p95/p99).
  - **Comparação:** linha esperada vs. observado. Sem target fechado de redução percentual — esta sprint estabelece BASELINE. Sprint 2 compara contra esta linha.
  - **Failure cases verified:** (a) 1 slot com SQL inválido proposital — outros 5 entregam, (b) fechar chat mid-build — `AbortController` propaga, slots in-flight retornam `aborted`.
- [ ] **Step 12.2:** Commit: `docs(canvas): add Sprint 1.B acceptance + baseline template`.

---

## Acceptance Criteria

- ✅ `pnpm test:run` verde com cobertura ≥80% em `src/features/canvas-orchestrator/lib/fill-*` (verificar via `pnpm test:run --coverage`).
- ✅ `pnpm tsc --noEmit` verde.
- ✅ `pnpm lint` verde.
- ✅ Build de dashboard com 6 blocos: `fill_layout` é chamado 1× (não 6×). Verificar nos logs estruturados via `grep fill_layout_started /tmp/canvas.ndjson | wc -l` = 1 por build.
- ✅ p50 wall-clock de builds com ≥4 blocos coletado em ≥10 amostras via Task 10 e registrado em `2026-05-04-sprint1-B-acceptance.md`.
- ✅ Erro em 1 slot não aborta os outros: criar slot com `intent` propositalmente impossível (ex.: "calcule a probabilidade de chover em Marte"), confirmar `successCount === 5, errorCount === 1` em build de 6.
- ✅ Cancelamento: fechar chat durante build dispara `AbortController.abort` e log final mostra `abortedCount > 0`.
- ✅ `fill_block` antigo continua funcional (testes de regressão em Task 11).

---

## Riscos e Rollback

| Risco | Mitigação |
|-------|-----------|
| Modelo continua chamando `fill_block` em vez de `fill_layout` por inércia do prompt | Reforço explícito no system prompt (Task 6.2). Logging diferenciado mostra qual foi usado. Se persistir, considerar `toolChoice: { type:'tool', toolName:'fill_layout' }` after `declare_layout` (Sprint 2). |
| `pLimit(3)` ainda atinge 429 do Vertex em horário de pico | Reduzir via `FILL_LAYOUT_CONCURRENCY=2` env var (Task 4 já suporta). Sem deploy. |
| Erro em `pickIndicator` (parte do fill flow) afeta múltiplos slots | `withRetry` já trata 429/503/quota. Sucessos parciais via `Promise.allSettled` garantem que erros isolados não derrubam o batch. |
| `experimental_telemetry` instável no AI SDK v6 | Flag opcional — se quebrar, remover apenas o bloco `experimental_telemetry`. `recordSpan` (próprio) continua funcional. |
| Async iterator de `fill_layout` consome buffer do client | Limite Zod `slots.max(20)` previne explosão. Se cliente pagar custo, mover yields intermediários para apenas `started` + `complete` (sem `slot_done`). |

**Rollback:** todos commits são incrementais. `git revert <task-N-commit>` por tarefa. `fill_block` antigo permanece registrado em `orchestrator.ts` durante toda a sprint — basta remover o registro de `fill_layout` para voltar ao comportamento anterior.

---

## Time de Execução

- **Tasks 1-4 (deps + libs puras):** general-purpose com TDD strict. ~3-4h.
- **Tasks 5-6 (tool + integração orchestrator):** general-purpose. ~2h.
- **Tasks 7-10 (telemetry + script):** general-purpose. ~2-3h.
- **Tasks 11-12 (regressão + doc):** general-purpose. ~1-2h.

**Total estimado:** 8-11h de execução sequencial. Tasks 7 e 10 podem rodar em paralelo às 4-6 se distribuído entre subagentes.

---

## Self-review Checklist

- [x] Header presente com Goal/Architecture/Tech Stack.
- [x] File structure exato (sem placeholders `<TBD>`).
- [x] Cada task tem RED test → GREEN impl → verify → commit.
- [x] Paths absolutos a partir do repo root.
- [x] `withRetry` reuso documentado (Task 2.2 e 4.2).
- [x] `p-limit` instalado antes de uso (Task 1 < Task 4).
- [x] `fill_block` mantido funcional (Task 11) — sem breaking change.
- [x] Acceptance critérios mensuráveis (counts, percentiles, comandos shell).
- [x] Rollback documentado por commit.
- [x] Sem dependência circular entre tasks (1→2,3→4→5→6; 7→8,9; 10 indep; 11 dep 2; 12 último).
