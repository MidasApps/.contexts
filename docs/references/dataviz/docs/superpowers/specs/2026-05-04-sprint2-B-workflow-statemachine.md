# Sprint 2.B — Mini State-Machine Workflow + Canvas Orchestrator Migration

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Tasks use checkbox (`- [ ]`) syntax with explicit RED → GREEN → verify cycles per `superpowers:test-driven-development`. Apply `superpowers:verification-before-completion` before claiming any task done.

**Goal:** Implementar uma **mini state-machine interna** (350-500 LOC, sem `@mastra/core`) em `src/features/canvas-orchestrator/workflow/` exportando primitives `createStep`, `runWorkflow`, `then`, `parallel`, `foreach`, `branch`, `dountil`, com tipagem genérica encadeada (output do step N = input do step N+1), `AbortSignal` propagado, validação Zod entre steps, error handling agregado e telemetria por step. Migrar o Canvas Orchestrator para o pipeline `plan → gather → layout → fill → validate → render`, com branches BQML/cliente explícitos e `dountil` para validação SQL. Multi-tenancy obrigatório via `requestContext.clientId` propagado em todo step (gate de auditoria).

**Architecture:** A mini state-machine é uma camada fina de TS sobre o AI SDK v6. Steps são funções puras tipadas + Zod. `runWorkflow` instrumenta cada step com `recordSpan` (Sprint 1.B) para p50/p95 wall-clock comparáveis ao baseline. Sub-workflow `fillSlot` substitui o caminho hoje implícito dentro de `fill_block` por um pipeline explícito `pickIndicator → branch(bqml|sql) → dountil(validate, max=3) → pickViz → materialize`. Feature-flag `useWorkflowOrchestrator` no `app-store` permite rollout gradual e rollback instantâneo. **Não-escopo:** suspend/resume/persistência de snapshots (sinal de migrar para Mastra real); supervisor melhorado do orchestrator analítico (Sprint 3.B).

**Tech Stack:** AI SDK v6, Vertex Gemini (`@ai-sdk/google-vertex`), Vitest 4.x (Sprint 1.A), Zod 4.x (`^4.3.6`), `p-limit@^6` (instalado em Sprint 1.B), `withRetry` existente (`src/features/ai-agents/lib/with-retry.ts`), `recordSpan` existente (`src/shared/lib/telemetry/record-span.ts`, Sprint 1.B Task 7).

---

## Contexto pré-leitura obrigatória

Antes de escrever qualquer código, leia:

1. **Plano-fonte:** `docs/superpowers/plans/2026-05-04-mastra-workflows-network.md` — §3 (Mapeamento Mastra ⇄ AI SDK), §4 (Redesenho Canvas Orchestrator + Concorrência/retry/cancelamento), §6 Fase 2.
2. **Sprint 1.B (prerequisite):** `docs/superpowers/plans/2026-05-04-sprint1-B-parallel-fill-blocks.md` — assume concluído. `fillBlock` puro, `fillLayoutParallel`, `recordSpan`, `experimental_telemetry` baseline existem e são reutilizados (não reimplementados).
3. **ADR de referência (já aceita):** `adrs/decisions/0003-mini-state-machine-vs-mastra-core.md` — justifica 350-500 LOC custom vs adoção de `@mastra/core`. Critérios para migração futura: (a) precisa de suspend/resume; (b) precisa snapshot persistido entre processos; (c) precisa cron triggers nativos; (d) precisa observability UI da Mastra. Enquanto nenhum desses entrar no roadmap, mantemos custom. Esta sprint **implementa** ADR-0003; se desviar (nova primitive, persistência), abrir ADR de superseção. ADRs correlatas: ADR-0002 (Mastra-as-library), ADR-0006 (multi-tenancy strict isolation).
4. **Skills aplicáveis:**
   - `superpowers:test-driven-development` — todo step novo tem RED test antes de GREEN impl.
   - `superpowers:verification-before-completion` — `pnpm test:run`, `pnpm tsc --noEmit`, `pnpm lint` verdes antes de qualquer "done".
   - `superpowers:subagent-driven-development` — Tasks 1-8 (primitives + telemetry) podem rodar em subagentes paralelos; Tasks 9-17 (steps específicos) seriam, por dependência sequencial, sequenciais.
5. **Mapeamento de call-sites (Task 17):** antes da migração, mapear todos os call-sites de `createCanvasOrchestrator` na repo (`app/api/canvas/route.ts`, `src/features/canvas-orchestrator/orchestrator.ts`, hooks/widgets que disparam streams). Use `superpowers:dispatching-parallel-agents` para subagente de exploração ou `grep -rn 'createCanvasOrchestrator\|orchestrator(' src app`. Output esperado: lista de paths absolutos + linhas + tipo de chamada para garantir que feature-flag está aplicada em 100% dos pontos de entrada.

**Chave de leitura do plano-fonte:** §3 deixa explícito que **6 primitives** (`step`, `then`, `parallel`, `foreach`, `branch`, `dountil`) **bastam** — `suspend/resume/persistência` é o gatilho para migrar a Mastra real; **não implementar agora**.

---

## File Structure

```
src/
├── features/
│   └── canvas-orchestrator/
│       ├── workflow/
│       │   ├── index.ts                            # NEW - re-exports
│       │   ├── types.ts                            # NEW - Step<I,O>, Workflow<I,O>, RunContext, RequestContext
│       │   ├── create-step.ts                      # NEW - createStep({inputSchema,outputSchema,execute})
│       │   ├── create-step.test.ts                 # NEW
│       │   ├── run-workflow.ts                     # NEW - runWorkflow(wf, input, ctx) + tracing
│       │   ├── run-workflow.test.ts                # NEW
│       │   ├── then.ts                             # NEW - composição linear
│       │   ├── then.test.ts                        # NEW
│       │   ├── create-workflow.ts                   # NEW - createWorkflow<I>({id,inputSchema,outputSchema}) identity helper
│       │   ├── create-workflow.test.ts              # NEW
│       │   ├── parallel.ts                         # NEW - Promise.allSettled + agregação
│       │   ├── parallel.test.ts                    # NEW
│       │   ├── foreach.ts                          # NEW - p-limit + partial success
│       │   ├── foreach.test.ts                     # NEW
│       │   ├── branch.ts                           # NEW - tabela cond/step
│       │   ├── branch.test.ts                      # NEW
│       │   ├── dountil.ts                          # NEW - loop com maxAttempts
│       │   ├── dountil.test.ts                     # NEW
│       │   ├── errors.ts                           # NEW - WorkflowError, StepValidationError, AggregateStepError, MissingTenantError
│       │   └── errors.test.ts                      # NEW
│       ├── steps/
│       │   ├── plan-step.ts                        # NEW - gemini-pro + Output.object()
│       │   ├── plan-step.test.ts                   # NEW
│       │   ├── gather-context-step.ts              # NEW - parallel(schema, sample, persona, bqml, glossary)
│       │   ├── gather-context-step.test.ts         # NEW
│       │   ├── design-layout-step.ts               # NEW - gemini-pro determinista
│       │   ├── design-layout-step.test.ts          # NEW
│       │   ├── fill-blocks-step.ts                 # NEW - foreach(slot, {concurrency:3})
│       │   ├── fill-blocks-step.test.ts            # NEW
│       │   ├── cross-validate-step.ts              # NEW - consistência entre blocos
│       │   ├── cross-validate-step.test.ts         # NEW
│       │   ├── render-commit-step.ts               # NEW - commit no canvas
│       │   ├── render-commit-step.test.ts          # NEW
│       │   ├── fill-slot-subworkflow.ts            # NEW - branch(bqml|sql) + dountil(validate)
│       │   ├── fill-slot-subworkflow.test.ts       # NEW
│       │   ├── pick-indicator-step.ts              # NEW
│       │   ├── generate-sql-step.ts                # NEW - gemini-flash, schema-aware
│       │   ├── use-bqml-step.ts                    # NEW - ML.FORECAST path
│       │   ├── validate-sql-step.ts                # NEW - dryRun BQ
│       │   └── pick-viz-step.ts                    # NEW
│       ├── orchestrator-workflow.ts                # NEW - buildDashboard workflow assembly
│       ├── orchestrator-workflow.test.ts           # NEW
│       └── orchestrator.ts                         # MODIFY - feature-flag gate
├── shared/
│   ├── stores/
│   │   └── app-store.ts                            # MODIFY - add useWorkflowOrchestrator flag
│   ├── config/
│   │   └── agents/
│   │       └── types.ts                            # MODIFY - add RequestContext, Intent, GatheredContext, LayoutPlan, ValidationReport
│   └── lib/
│       └── telemetry/
│           └── record-span.ts                      # (existing, reuse)
adrs/
└── decisions/
    └── 0003-mini-state-machine-vs-mastra-core.md     # EXISTING (status: Proposed → mover para Accepted ao fim da sprint)
docs/
└── superpowers/
    └── plans/
        └── 2026-05-04-sprint2-B-acceptance.md      # NEW (Task 19)
scripts/
└── smoke-workflow-orchestrator.ts                  # NEW (Task 19)
```

**Tamanho-alvo:** primitives + types + errors ~500 LOC; steps ~700-1000 LOC; testes ~1500-2000 LOC. Total entrega 2700-3500 LOC com testes (cap "350-500 LOC" do plano refere-se **apenas** a `workflow/` core sem steps nem testes).

---

## Tasks

### Task 1: Tipos do workflow (`Step<I,O>`, `Workflow<I,O>`, `RunContext`, `RequestContext`)

**Files:** `src/features/canvas-orchestrator/workflow/types.ts` (new), `src/shared/config/agents/types.ts` (modify).

- [ ] **Step 1.1:** Em `src/shared/config/agents/types.ts`, adicionar:
  ```typescript
  export type ClientId = 'OM' | 'BRZ' | 'CONX' | 'IMCASA';

  export interface RequestContext {
    clientId: ClientId;          // multi-tenancy gate
    sessionId: string;
    userId?: string;
    locale?: string;
  }

  export interface Intent {
    kind: 'kpi' | 'chart' | 'table' | 'text' | 'forecast';
    description: string;
    targetType: 'kpi' | 'chart' | 'table' | 'text';
    agentType: 'financial_analyst' | 'data_engineer' | 'risk_analyst' | 'report_writer';
    priority: number; // 0..10
  }

  export interface GatheredContext {
    schema: Record<string, unknown>;
    sample: Array<Record<string, unknown>>;
    persona: { id: string; instructions: string };
    bqml: { available: boolean; models: string[] };
    glossary: Record<string, string>;
    filterOptions: Record<string, string[]>;
  }

  export interface LayoutPlan {
    pages: Array<{ pageIndex: number; slots: SlotSpec[] }>;
  }

  export interface ValidationReport {
    ok: boolean;
    issues: Array<{ slotId: string; severity: 'warn' | 'error'; message: string }>;
  }
  ```
- [ ] **Step 1.2:** Criar `workflow/types.ts`:
  ```typescript
  import type { z } from 'zod';
  import type { RequestContext } from '@/shared/config/agents/types';

  export interface RunContext {
    requestContext: RequestContext;
    signal: AbortSignal;
    telemetry: { workflowId: string; runId: string; parentSpan?: string };
  }

  export interface Step<I, O> {
    readonly id: string;
    readonly inputSchema: z.ZodType<I>;
    readonly outputSchema: z.ZodType<O>;
    execute(input: I, ctx: RunContext): Promise<O>;
  }

  export interface Workflow<I, O> {
    readonly id: string;
    readonly inputSchema: z.ZodType<I>;
    readonly outputSchema: z.ZodType<O>;
    execute(input: I, ctx: RunContext): Promise<O>;
    then<O2>(next: Step<O, O2> | Workflow<O, O2>): Workflow<I, O2>;
  }
  ```
- [ ] **Step 1.3 (RED — type-only test):** `workflow/types.test.ts` usando `expectTypeOf`:
  - `Workflow<A,B>.then(Step<B,C>)` retorna `Workflow<A,C>`.
  - `Workflow<A,B>.then(Step<X,Y>)` quando `X !== B` causa erro de compilação (`@ts-expect-error`).
  - `RunContext.requestContext.clientId` é union literal restrita.
- [ ] **Step 1.4 (verify):** `pnpm tsc --noEmit` verde.
- [ ] **Step 1.5:** Commit: `feat(workflow): add Step, Workflow, RunContext and RequestContext types`.

---

### Task 2: `errors.ts` — hierarquia de erros tipados

**Files:** `src/features/canvas-orchestrator/workflow/errors.ts` (new), `…/errors.test.ts` (new).

- [ ] **Step 2.1 (RED):** Testes para:
  - `WorkflowError` é base com `stepId?`, `runId`, `cause?`.
  - `StepValidationError` carrega `ZodError.issues` e fonte (`input` | `output`).
  - `AggregateStepError` aceita `Array<{stepId, error}>` e expõe `.errors`.
  - `MissingTenantError` mensagem `'requestContext.clientId is required'`.
  - Cada erro `instanceof WorkflowError`.
- [ ] **Step 2.2 (GREEN):** Implementar com `extends Error` e `Object.setPrototypeOf` em cada constructor (compat ES5 target).
- [ ] **Step 2.3 (verify):** Tests verdes.
- [ ] **Step 2.4:** Commit: `feat(workflow): add typed error hierarchy`.

---

### Task 3: `createStep` com validação Zod

**Files:** `src/features/canvas-orchestrator/workflow/create-step.ts` (new), `…/create-step.test.ts` (new).

- [ ] **Step 3.1 (RED):** Testes:
  - **A — happy:** step com `z.number()` in / `z.number()` out, `execute: x => x*2`. Chamar com `5` retorna `10`.
  - **B — input invalid:** passar `'foo'` → lança `StepValidationError` com `source: 'input'`.
  - **C — output invalid:** `execute: () => 'not-a-number' as any` → lança `StepValidationError` com `source: 'output'`.
  - **D — multi-tenancy:** `RunContext` sem `clientId` → lança `MissingTenantError` antes de executar.
  - **E — abort:** `signal.aborted === true` ao chamar → lança `AbortError` sem rodar `execute`.
  - **F — type-only:** `Step<number,string>` recusa `Step<number,number>` em compile (`@ts-expect-error`).
- [ ] **Step 3.2 (GREEN):**
  ```typescript
  import { z } from 'zod';
  import type { Step } from './types';
  import type { RunContext } from './types';
  import { StepValidationError, MissingTenantError } from './errors';

  export interface CreateStepArgs<I, O> {
    id: string;
    inputSchema: z.ZodType<I>;
    outputSchema: z.ZodType<O>;
    execute: (input: I, ctx: RunContext) => Promise<O> | O;
  }

  export function createStep<I, O>(args: CreateStepArgs<I, O>): Step<I, O> {
    return {
      id: args.id,
      inputSchema: args.inputSchema,
      outputSchema: args.outputSchema,
      async execute(rawInput, ctx) {
        if (!ctx.requestContext?.clientId) throw new MissingTenantError(args.id);
        if (ctx.signal.aborted) throw new DOMException('Aborted', 'AbortError');
        const inputParse = args.inputSchema.safeParse(rawInput);
        if (!inputParse.success) throw new StepValidationError(args.id, 'input', inputParse.error);
        const result = await args.execute(inputParse.data, ctx);
        const outputParse = args.outputSchema.safeParse(result);
        if (!outputParse.success) throw new StepValidationError(args.id, 'output', outputParse.error);
        return outputParse.data;
      },
    };
  }
  ```
- [ ] **Step 3.3 (verify):** Tests verdes; `pnpm tsc --noEmit` verde.
- [ ] **Step 3.4:** Commit: `feat(workflow): add createStep with Zod validation and tenant gate`.

---

### Task 4: `runWorkflow` + tracing por step

**Files:** `src/features/canvas-orchestrator/workflow/run-workflow.ts` (new), `…/run-workflow.test.ts` (new).

- [ ] **Step 4.1 (RED):** Testes:
  - **A — single step:** `runWorkflow(stepWf, 5, ctx)` retorna o output. Spy em `recordSpan` recebe 1 chamada com `name: 'workflow:<id>'` e 1 chamada com `name: 'step:<id>'`.
  - **B — propaga erro:** step que rejeita propaga sem mascarar; span tem `status:'error'`.
  - **C — abort externo:** abortar `signal` durante step lança `AbortError`; span captura `status:'error'`.
  - **D — runId único:** dois `runWorkflow` em paralelo geram `runId` diferentes (UUID v4 ou crypto.randomUUID).
- [ ] **Step 4.2 (GREEN):**
  ```typescript
  import { recordSpan } from '@/shared/lib/telemetry/record-span';
  import type { Workflow, RunContext } from './types';
  import type { RequestContext } from '@/shared/config/agents/types';
  import { MissingTenantError } from './errors';

  export async function runWorkflow<I, O>(
    wf: Workflow<I, O>,
    input: I,
    args: { requestContext: RequestContext; signal?: AbortSignal },
  ): Promise<O> {
    if (!args.requestContext?.clientId) throw new MissingTenantError(wf.id);
    const runId = crypto.randomUUID();
    const ctx: RunContext = {
      requestContext: args.requestContext,
      signal: args.signal ?? new AbortController().signal,
      telemetry: { workflowId: wf.id, runId },
    };
    return recordSpan(
      { name: `workflow:${wf.id}`, attributes: { runId, clientId: args.requestContext.clientId } },
      () => wf.execute(input, ctx),
    );
  }
  ```
- [ ] **Step 4.3:** Cada `Step.execute` quando invocado a partir de combinators (Tasks 5-8) também é envolvido em `recordSpan({name:'step:<id>',attributes:{runId,clientId}})`.
- [ ] **Step 4.4 (verify):** Tests verdes.
- [ ] **Step 4.5:** Commit: `feat(workflow): add runWorkflow with per-step tracing`.

---

### Task 5: `then` (composição linear)

**Files:** `workflow/then.ts` (new), `…/then.test.ts` (new).

- [ ] **Step 5.1 (RED):** Testes:
  - `then(stepA: Step<I,M>, stepB: Step<M,O>) → Workflow<I,O>` execução sequencial passa output de A como input de B.
  - Falha em A não chama B.
  - Type-only: tentar compor `Step<I,M>` com `Step<X,O>` (`X !== M`) é erro de compilação.
  - `Workflow<I,M>.then(Step<M,O>)` também funciona (overload).
- [ ] **Step 5.2 (GREEN):** Função `then` + método `.then` em `Workflow` (Task 1.2). Implementar também `createWorkflow<I>({id,inputSchema,outputSchema}): Workflow<I,I>` (identity start) em `create-workflow.ts` para suportar a API `createWorkflow(...).then(stepA).then(stepB)`.
- [ ] **Step 5.3:** Garantir que `then(a,b).then(c)` compõe em `Workflow<IA,OC>` corretamente. Para `createWorkflow<I>(...).then(stepA: Step<I,A>).then(stepB: Step<A,B>)` o tipo final é `Workflow<I,B>`.
- [ ] **Step 5.4 (verify):** Tests verdes.
- [ ] **Step 5.5:** Commit: `feat(workflow): add then() linear composition`.

---

### Task 6: `parallel` com agregação tipada

**Files:** `workflow/parallel.ts` (new), `…/parallel.test.ts` (new).

- [ ] **Step 6.1 (RED):**
  - `parallel([Step<I,A>, Step<I,B>, Step<I,C>]) → Step<I,[A,B,C]>` retorna tupla preservando ordem.
  - `Promise.allSettled`: se 1 step falhar mas outros sucederem, lança `AggregateStepError` com lista de falhas; em modo `{strategy:'all-or-nothing'}` (default) propaga primeira falha.
  - Modo `{strategy:'partial'}` permite resultado parcial: tipo retorno `[Result<A>, Result<B>, Result<C>]` discriminado.
  - Abort propagado a todos os steps.
- [ ] **Step 6.2 (GREEN):** Implementar com `Promise.allSettled`, agregação por índice; cada step envolto em `recordSpan(step:<id>)`.
- [ ] **Step 6.3 (verify):** Tests verdes.
- [ ] **Step 6.4:** Commit: `feat(workflow): add parallel() with all-or-nothing and partial strategies`.

---

### Task 7: `foreach` com `p-limit` + partial success

**Files:** `workflow/foreach.ts` (new), `…/foreach.test.ts` (new).

- [ ] **Step 7.1 (RED):**
  - `foreach(step: Step<Item,Out>, {concurrency:3}) → Step<Item[], Array<{status:'success',value:Out}|{status:'error',error}|{status:'aborted'}>>`.
  - Concurrency cap respeitado (test com delays + jest fake timers ou medição real).
  - Partial success: 6 itens, 2 falham → `{successCount:4, errorCount:2}`.
  - Abort mid-flight → itens não-iniciados retornam `{status:'aborted'}`.
- [ ] **Step 7.2 (GREEN):** Reusar `pLimit` (já em deps). Internamente delega para padrão de `fillLayoutParallel` (Sprint 1.B) — extrair se conveniente, mas **não duplicar**: importar e adaptar para shape genérico `<Item,Out>`.
- [ ] **Step 7.3 (verify):** Tests verdes.
- [ ] **Step 7.4:** Commit: `feat(workflow): add foreach() with p-limit and partial success`.

---

### Task 8: `branch` e `dountil`

**Files:** `workflow/branch.ts`, `workflow/dountil.ts` + tests.

- [ ] **Step 8.1 (RED — branch):**
  - `branch([[predicate, step], ...], fallbackStep)` testa predicates em ordem; primeiro `true` ganha.
  - Sem fallback e nenhum predicate matchou → `WorkflowError('no branch matched')`.
  - Cada predicate recebe `(input, ctx) => boolean | Promise<boolean>`.
  - Type-only: todos os steps devem retornar o mesmo `O`; mismatch falha em compile.
- [ ] **Step 8.2 (GREEN — branch):** Implementar.
- [ ] **Step 8.3 (RED — dountil):**
  - `dountil(step: Step<I,O>, predicate: (out:O,attempts:number)=>boolean, {maxAttempts}) → Step<I,O>`.
  - Para até `predicate === true` ou `attempts === maxAttempts` (lança `WorkflowError('dountil exhausted')` com último output).
  - Idempotência: chamar com mesmo `input` produz tentativa fresh (sem cache implícito).
  - `attempts` começa em 1.
- [ ] **Step 8.4 (GREEN — dountil):** Loop simples.
- [ ] **Step 8.5 (verify):** Tests verdes.
- [ ] **Step 8.6:** Commit: `feat(workflow): add branch() and dountil() primitives`.

---

### Task 9: `planStep` — gemini-pro com `Output.object()`

**Files:** `src/features/canvas-orchestrator/steps/plan-step.ts` (new), `…/plan-step.test.ts` (new).

- [ ] **Step 9.1 (RED):**
  - Mock `generateText` (AI SDK v6 `Output.object()` retorna `experimental_output`).
  - Input: `{briefing: string}`; output: `{intents: Intent[]}` (Zod do `shared/config/agents/types.ts`).
  - Caso A: response `{intents:[{kind:'kpi',...}]}` → output Zod-válido.
  - Caso B: response com schema inválido → `StepValidationError` (output).
  - Caso C: timeout 20s → erro tipado.
- [ ] **Step 9.2 (GREEN):**
  ```typescript
  import { generateText, Output } from 'ai';
  import { getModel } from '@/features/ai-agents/model-registry';
  import { withRetry } from '@/features/ai-agents/lib/with-retry';
  import { z } from 'zod';
  import { createStep } from '../workflow/create-step';

  const PlanInput = z.object({ briefing: z.string().min(1) });
  const PlanOutput = z.object({ intents: z.array(/* Intent schema */).min(1).max(20) });

  export const planStep = createStep({
    id: 'plan',
    inputSchema: PlanInput,
    outputSchema: PlanOutput,
    async execute({ briefing }, ctx) {
      const result = await withRetry(
        () => generateText({
          model: getModel('pro'),
          system: 'You are a dashboard planner. Output strictly the schema.',
          prompt: briefing,
          experimental_output: Output.object({ schema: PlanOutput }),
          abortSignal: ctx.signal,
        }),
        { label: `step:plan:${ctx.telemetry.runId}` },
      );
      return result.experimental_output;
    },
  });
  ```
- [ ] **Step 9.3 (verify):** Tests verdes.
- [ ] **Step 9.4:** Commit: `feat(workflow): add planStep with gemini-pro structured output`.

---

### Task 10: `gatherContextStep` — `parallel` de 5 fontes

**Files:** `steps/gather-context-step.ts` + test.

- [ ] **Step 10.1 (RED):** Mocks de `fetchSchema`, `fetchSample`, `fetchPersona`, `probeBqml`, `loadGlossary`, `fetchFilterOptions`. Testar:
  - Output Zod = `GatheredContext`.
  - Falha em `probeBqml` em modo `partial` retorna `bqml.available=false` (graceful).
  - `clientId` propagado a cada fetcher (assertion via mock spy).
- [ ] **Step 10.2 (GREEN):** Compor com `parallel([...], {strategy:'partial'})` e mapear `Result[]` para `GatheredContext`. Falhas em fontes não-críticas viram defaults; falha em `schema` (crítico) propaga.
- [ ] **Step 10.3 (verify):** Tests verdes.
- [ ] **Step 10.4:** Commit: `feat(workflow): add gatherContextStep parallelizing 5 context sources`.

---

### Task 11: `designLayoutStep` — gemini-pro determinista

**Files:** `steps/design-layout-step.ts` + test.

- [ ] **Step 11.1 (RED):**
  - Input: `{intents: Intent[], context: GatheredContext}`; output: `LayoutPlan`.
  - Determinismo: `temperature: 0`, mesma seed/input produz mesmo layout (snapshot test com mock).
  - Slots têm `slotId` único (`uuid`-like).
- [ ] **Step 11.2 (GREEN):** `generateText` com `Output.object()` para `LayoutPlan`, `temperature: 0`.
- [ ] **Step 11.3 (verify):** Tests verdes.
- [ ] **Step 11.4:** Commit: `feat(workflow): add designLayoutStep with deterministic layout generation`.

---

### Task 12: `fillBlocksStep` — `foreach(slot, {concurrency:3})` reusa Sprint 1.B

**Files:** `steps/fill-blocks-step.ts` + test.

- [ ] **Step 12.1 (RED):**
  - Input: `LayoutPlan + GatheredContext`; output: `Array<FillBlockResult>` (tipo Sprint 1.B).
  - Mock `fillSlotSubworkflow` (Task 15) para retornar resultado por slot.
  - Concurrency 3 verificada via timing.
  - Partial success: 6 slots, 2 falham → `successCount:4`.
- [ ] **Step 12.2 (GREEN):** Compor `foreach(fillSlotSubworkflowAsStep, {concurrency:3})`. Não chamar `fillBlock` puro diretamente — passar pelo sub-workflow para ter o `branch(bqml|sql)` + `dountil(validate)` explícitos.
- [ ] **Step 12.3 (verify):** Tests verdes.
- [ ] **Step 12.4:** Commit: `feat(workflow): add fillBlocksStep using foreach over fillSlot subworkflow`.

---

### Task 13: `crossValidateStep` — consistência entre blocos

**Files:** `steps/cross-validate-step.ts` + test.

- [ ] **Step 13.1 (RED):**
  - Detecta KPIs duplicados (mesmo `label` + mesma `intent.kind`).
  - Detecta filtros incompatíveis (slot A usa `dataset=X`, slot B usa `dataset=Y`).
  - Detecta janelas temporais conflitantes em mesma página.
  - Output: `ValidationReport`. `issues[].severity==='error'` quebra render.
- [ ] **Step 13.2 (GREEN):** Step puro, sem LLM. Funções de checagem.
- [ ] **Step 13.3 (verify):** Tests verdes.
- [ ] **Step 13.4:** Commit: `feat(workflow): add crossValidateStep with deterministic block consistency checks`.

---

### Task 14: `renderCommitStep` — commit no canvas

**Files:** `steps/render-commit-step.ts` + test.

- [ ] **Step 14.1 (RED):**
  - Input: blocos validados + `LayoutPlan`.
  - Mock `canvasStore.commitBlocks(...)`.
  - Falha de validação (`ValidationReport.ok===false` com severidade `error`) **não** comita; lança `WorkflowError`.
  - Aborto durante commit é cancelável.
- [ ] **Step 14.2 (GREEN):** Step thin wrapping em chamada ao canvas store.
- [ ] **Step 14.3 (verify):** Tests verdes.
- [ ] **Step 14.4:** Commit: `feat(workflow): add renderCommitStep gated by validation report`.

---

### Task 15: Sub-workflow `fillSlot` — `branch(bqml|sql)` + `dountil(validateSql)`

**Files:** `steps/fill-slot-subworkflow.ts`, `pick-indicator-step.ts`, `generate-sql-step.ts`, `use-bqml-step.ts`, `validate-sql-step.ts`, `pick-viz-step.ts` + tests.

- [ ] **Step 15.1 (RED — pickIndicator):** dado `Intent` + `GatheredContext`, retorna `{indicatorId, columns}`. Modelo gemini-flash.
- [ ] **Step 15.2 (RED — generateSql):** schema-aware via `Output.object({sql:string, params:object})`. `temperature:0.1`.
- [ ] **Step 15.3 (RED — useBqmlStep):** quando `intent.kind==='forecast' && context.bqml.available`, gera `ML.FORECAST(...)` parametrizado.
- [ ] **Step 15.4 (RED — validateSql):** chama BQ `dryRun`. Output `{ok:boolean, error?:string}`.
- [ ] **Step 15.5 (RED — pickViz):** dado `intent.targetType` + amostra de resultado, decide vis (`bar`, `line`, `area`, `kpi`, `table`).
- [ ] **Step 15.6 (RED — fillSlot subworkflow):**
  ```typescript
  // input do sub-workflow carrega { intent, context: GatheredContext, slotId, pageIndex }
  const fillSlot = createWorkflow({ id: 'fill-slot', inputSchema: FillSlotInput, outputSchema: FillSlotOutput })
    .then(pickIndicatorStep)
    .then(branch(
      [
        [(input) => input.intent.kind === 'forecast' && input.context.bqml.available, useBqmlStep],
      ],
      generateSqlStep, // fallback explícito
    ))
    .then(dountil(validateSqlStep, (out, attempts) => out.ok || attempts >= 3, { maxAttempts: 3 }))
    .then(pickVizStep)
    .then(materializeBlockStep);
  ```
  **Importante:** `branch` predicate recebe `(input, ctx)`. `clientId` vem de `ctx.requestContext.clientId` (ADR-0006); flags de capacidade (`bqml.available`) vêm do `input` carregado pelos steps anteriores — `RunContext` **não** carrega `gatheredContext`, é só `requestContext`+`signal`+`telemetry`.
  Casos de teste:
  - Branch BQML quando aplicável.
  - Fallback SQL.
  - SQL inválido reparado em 2ª tentativa (dountil).
  - SQL inválido após 3 tentativas → step falha com `error`.
  - Idempotência: mesma slotId + input produz mesmo block (test com mock determinístico).
- [ ] **Step 15.7 (GREEN):** Implementar 5 sub-steps + assembly. `materializeBlockStep` reusa `convertToBlock` de `tools/fill-block-internals.ts` (Sprint 1.B Task 2.3).
- [ ] **Step 15.8 (verify):** Tests verdes.
- [ ] **Step 15.9:** Commit: `feat(workflow): add fillSlot subworkflow with bqml branch and dountil sql validation`.

---

### Task 16: Feature-flag `useWorkflowOrchestrator`

**Files:** `src/shared/stores/app-store.ts` (modify), `src/features/canvas-orchestrator/orchestrator.ts` (modify).

- [ ] **Step 16.1:** Em `app-store.ts`, dentro do slice de feature-flags (criar se não existir):
  ```typescript
  featureFlags: {
    useWorkflowOrchestrator: false, // default OFF
  },
  setFeatureFlag(name: 'useWorkflowOrchestrator', value: boolean) { ... },
  ```
  Persistir em `localStorage` via middleware `persist` (assumindo que já existe; se não, usar `localStorage` direto com chave `liquid:flags`).
- [ ] **Step 16.2:** Em `orchestrator.ts`, ler flag (server-side via header ou query param `?orchestrator=workflow` para evitar acoplar server a Zustand). Decisão de design: passar flag como argumento explícito de `createCanvasOrchestrator(input, { useWorkflow: boolean })`. Cliente lê do store e envia em request body.
- [ ] **Step 16.3 (test):** Vitest:
  - Flag OFF → caminho legado (`fillLayoutParallel` Sprint 1.B).
  - Flag ON → invoca `runWorkflow(buildDashboard, ..., { requestContext, signal })`.
- [ ] **Step 16.4 (verify):** Tests verdes; `pnpm tsc --noEmit` verde.
- [ ] **Step 16.5:** Commit: `feat(canvas): add useWorkflowOrchestrator feature flag`.

---

### Task 17: Migrar Canvas Orchestrator para o pipeline workflow

**Files:** `src/features/canvas-orchestrator/orchestrator-workflow.ts` (new), `…/orchestrator-workflow.test.ts` (new), `orchestrator.ts` (modify).

- [ ] **Step 17.1 (mapeamento de call-sites):** Antes de codar, listar todos os call-sites de `createCanvasOrchestrator` (subagente via `superpowers:dispatching-parallel-agents` ou `grep -rn 'createCanvasOrchestrator' app src`). Output: paths absolutos + linhas + tipo de invocação (route handler, hook, widget) em formato `path:line — kind`. Verificar que feature-flag aplicada cobre 100% dos pontos de entrada.
- [ ] **Step 17.2 (RED):** `orchestrator-workflow.test.ts`:
  - Mock todos os steps individualmente.
  - **A — happy path:** input `{briefing, dataset, requestContext}` → execução em ordem `plan → gather → designLayout → fillBlocks → crossValidate → renderCommit`. Assert ordem via spy.
  - **B — abort:** `signal.abort()` durante `fillBlocks` cancela `crossValidate` e `renderCommit`.
  - **C — multi-tenancy fail-closed:** `requestContext` sem `clientId` → `MissingTenantError` antes de step 1.
  - **D — partial fill:** `fillBlocks` retorna 4 sucesso 2 erro; `crossValidate` ainda roda nos 4; `renderCommit` comita 4 + placeholders nos 2.
- [ ] **Step 17.3 (GREEN):**
  ```typescript
  // orchestrator-workflow.ts
  export const buildDashboardWorkflow = createWorkflow({
    id: 'build-dashboard',
    inputSchema: BuildInput, // entrada inicial = input do planStep
    outputSchema: BuildOutput, // saída final = output do renderCommitStep
  })
    .then(planStep)
    .then(gatherContextStep)
    .then(designLayoutStep)
    .then(fillBlocksStep)
    .then(crossValidateStep)
    .then(renderCommitStep);
  ```
  Helper `createWorkflow<I>({id, inputSchema, outputSchema})` é thin: retorna um `Workflow<I,I>` identity (`execute = async (x) => x`); cada `.then(step)` re-tipa para `Workflow<I, OutN>`. Implementação custom (mini state-machine), **não** importa de `@mastra/core`. Forma da API espelha `@mastra/core/workflows` para porte futuro mecânico (ADR-0003).
- [ ] **Step 17.4:** Em `orchestrator.ts`:
  ```typescript
  if (input.useWorkflow) {
    return runWorkflow(buildDashboardWorkflow, { briefing: input.briefing, dataset: input.dataset }, {
      requestContext: input.requestContext,
      signal: input.signal,
    });
  }
  // legado supervisor permanece para conversação
  return streamText({...});
  ```
  **Importante:** o `streamText` supervisor permanece para conversação livre. O workflow só é invocado quando o usuário pede explicitamente "monte um dashboard".
- [ ] **Step 17.5 (verify):** `pnpm test:run` verde; `pnpm tsc --noEmit` verde; `pnpm lint` verde.
- [ ] **Step 17.6:** Commit: `feat(canvas): migrate dashboard build path to workflow orchestrator behind feature flag`.

---

### Task 18: Telemetria por step (p50/p95)

**Files:** `workflow/run-workflow.ts` (modify), `scripts/measure-workflow.ts` (new — analógo a `measure-fill-baseline.ts`).

- [ ] **Step 18.1:** Garantir que cada step gera log `{event:'span', name:'step:<id>', durationMs, attributes:{runId, clientId, workflowId}}`.
- [ ] **Step 18.2:** Criar `scripts/measure-workflow.ts` que agrega por `name` (step:plan, step:gather, ...) e produz tabela markdown com p50/p95/p99.
- [ ] **Step 18.3 (smoke):** Gerar 5+ runs com flag ON. Coletar logs. Rodar script. Anexar tabela no acceptance doc.
- [ ] **Step 18.4 (verify):** Comparar com baseline Sprint 1.B (`fill_layout_total`). Workflow não pode regredir p50 — registrar no acceptance.
- [ ] **Step 18.5:** Commit: `feat(telemetry): add per-step workflow percentile script`.

---

### Task 19: Smoke E2E manual + ADR-0003 (transição para Accepted) + acceptance doc

**Files:** `adrs/decisions/0003-mini-state-machine-vs-mastra-core.md` (modify — status `Proposed` → `Accepted`), `docs/superpowers/plans/2026-05-04-sprint2-B-acceptance.md` (new), `scripts/smoke-workflow-orchestrator.ts` (new).

- [ ] **Step 19.1:** Atualizar ADR-0003 (já existente em `adrs/decisions/0003-mini-state-machine-vs-mastra-core.md`):
  - Mover `status: Proposed` → `Accepted`.
  - Acrescentar entrada no histórico: data + "Aceitação após PoC do Sprint 2.B (link para acceptance doc)".
  - Confirmar consequências validadas: sem suspend/resume, sem snapshot persistido, sem cron, observabilidade via `recordSpan` + Cloud Logging.
  - Confirmar gatilhos de migração futura: (a) suspend/resume, (b) snapshot persistido, (c) cron, (d) observability UI.
- [ ] **Step 19.2:** `scripts/smoke-workflow-orchestrator.ts`: invoca `runWorkflow(buildDashboardWorkflow, ...)` com briefing fixture (`'monte um dashboard com 6 KPIs de inadimplência para o cliente OM'`), `clientId='OM'`, captura output e imprime tempo total + counts.
- [ ] **Step 19.3:** `acceptance.md`:
  - Smoke checklist (a-f, mesmo padrão Sprint 1.B).
  - Tabela baseline p50/p95 por step (preenchida após Task 18).
  - Failure cases: (a) clientId omitido → falha fechada em todos os steps; (b) BQML probe falha → fallback SQL ativa branch; (c) SQL inválido em 2 slots → dountil repara 1, falha 1 após 3 tentativas, crossValidate marca, renderCommit usa placeholder.
- [ ] **Step 19.4 (smoke):** `pnpm tsx scripts/smoke-workflow-orchestrator.ts` retorna sucesso com 6 blocos.
- [ ] **Step 19.5:** Commit: `docs(canvas): accept ADR-0003 mini state-machine and add Sprint 2.B acceptance`.

---

## Acceptance Criteria

- ✅ `pnpm test:run` verde com cobertura **≥85%** em `src/features/canvas-orchestrator/workflow/` e **≥80%** em `src/features/canvas-orchestrator/steps/` (`pnpm test:run --coverage`).
- ✅ `pnpm tsc --noEmit` verde — tipagem genérica encadeada exercitada (`Workflow<I,M>.then(Step<M,O>)`); `@ts-expect-error` cobrindo mismatches.
- ✅ `pnpm lint` verde.
- ✅ **100% dos steps** têm `inputSchema` + `outputSchema` Zod validados em runtime (test de cada step inclui caso schema-inválido).
- ✅ **Multi-tenancy fail-closed:** test que invoca `runWorkflow` com `requestContext.clientId` ausente → `MissingTenantError` antes do step 1; test em cada step individual confirmando que `createStep` valida `clientId`.
- ✅ **E2E:** com flag `useWorkflowOrchestrator=true`, build de **6 blocos** completa sem regressão visual vs flag OFF (smoke manual: comparar canvas resultante).
- ✅ **Performance:** p50 wall-clock total do workflow ≤ p50 do `fillLayoutParallel` baseline Sprint 1.B (medido em ≥10 runs cada via Tasks 18 + script Sprint 1.B Task 10). Workflow **não pode regredir**.
- ✅ **Branches verificáveis:** test confirma que `intent.kind==='forecast' && bqml.available` ativa `useBqmlStep`; demais ativam `generateSqlStep`.
- ✅ **`dountil` retry:** test confirma SQL inválido em 1ª tentativa + reparo em 2ª = sucesso; 3 falhas = erro tipado.
- ✅ **Idempotência:** test confirma que rodar `fillSlotSubworkflow` 2× com mesmo input produz mesmo `block` (mocks determinísticos).
- ✅ **Tamanho do core:** `wc -l src/features/canvas-orchestrator/workflow/*.ts` (excluindo `*.test.ts`) entre **350 e 600 LOC**.
- ✅ ADR-0003 atualizada para `status: Accepted` com referência ao acceptance doc desta sprint.

---

## Riscos e Rollback

| Risco | Mitigação |
|-------|-----------|
| Mini-lib vira "framework caseiro" e cresce além do necessário | Cap rígido em 6 primitives. Sem suspend/resume/persistência. PR review rejeita primitives novos sem ADR. |
| Tipagem genérica encadeada fica intratável (`Workflow<A,B>.then(...).then(...)`) | Tests `expectTypeOf` em cada combinator. Se compile time piorar >2× em monorepo, considerar simplificar (perder algum encadeamento ergonômico em troca de inferência rápida). |
| Workflow regride p50 vs Sprint 1.B (overhead de Zod parses + spans) | KPI gating: Task 18 mede; se regride, perfil + remover Zod parses em paths quentes (parse só em entry/exit do workflow, não a cada step interno). Feature-flag mantém fallback. |
| Branch BQML leva a SQL malformado quando modelo está disponível mas dataset não tem dados | `validateSql` (`dountil`) já cobre: dryRun BQ falha → tenta novamente. 3 tentativas → erro do slot, não do build inteiro. |
| `clientId` omitido em call-site novo após merge | `MissingTenantError` lançado em `createStep` e `runWorkflow` torna falha óbvia em DEV/CI. Test E2E com `clientId` ausente garante regressão coberta. |
| Migração quebra rota `/api/canvas` | Feature-flag default `false`. Rollback = setar flag false (sem deploy). Testes E2E rodam com flag ON e OFF. |
| `Explore` agent (Task 17.1) não cobre algum call-site dinâmico | Após dispatch, grep manual de `createCanvasOrchestrator|orchestrator(` cobre dinâmicos. Documentar no acceptance. |
| AI SDK v6 `Output.object()` falha quando modelo retorna texto fora do schema | `withRetry` reusado; após N falhas, step falha com `StepValidationError(output)` — granular, não derruba workflow se step não-crítico. |

**Rollback estratégia:**
- **Soft:** flag `useWorkflowOrchestrator=false`. Caminho Sprint 1.B continua intacto.
- **Hard:** `git revert` por task. Cada commit é incremental e isolado. Tasks 1-8 (workflow core + tests) podem permanecer mesmo com rollback de Tasks 9-17.

---

## Time de Execução

- **Tasks 1-2 (types + errors):** subagent-driven, TDD strict. ~2-3h.
- **Tasks 3-8 (primitives `createStep`, `runWorkflow`, `then`, `parallel`, `foreach`, `branch`, `dountil`):** dispatch paralelo via `superpowers:dispatching-parallel-agents` (independentes após Task 1). ~6-8h em paralelo.
- **Tasks 9-14 (steps individuais):** sequenciais por dependência de tipos. ~5-6h.
- **Task 15 (sub-workflow `fillSlot`):** depende de Tasks 9-14. ~3-4h.
- **Tasks 16-17 (feature-flag + migration):** depende de tudo. Use `Explore` agent na 17.1. ~3-4h.
- **Tasks 18-19 (telemetria + ADR + acceptance):** ~2-3h.

**Total estimado:** 21-28h de execução. Em modo subagent-driven com 3 workers paralelos, 12-15h reais.

**Sub-skills:**
- `superpowers:test-driven-development` — toda task.
- `superpowers:subagent-driven-development` — recomendado para Tasks 3-8 e 9-14 (independentes).
- `superpowers:dispatching-parallel-agents` — Tasks 5-8 (combinators independentes).
- `superpowers:verification-before-completion` — antes de cada commit.
- `superpowers:requesting-code-review` — antes de fechar a sprint (PR final).

---

## Self-review Checklist

- [x] Header presente com Goal/Architecture/Tech Stack.
- [x] Contexto pré-leitura obrigatória (plano-fonte + Sprint 1.B + ADR-0003/0002/0006 aceitas + skills + mapeamento de call-sites em Task 17.1).
- [x] File structure exato, sem `<TBD>`.
- [x] Cada task tem RED test → GREEN impl → verify → commit.
- [x] Paths absolutos a partir do repo root.
- [x] Multi-tenancy gate explícito (`MissingTenantError`) em `createStep` e `runWorkflow`.
- [x] Reuso de Sprint 1.B documentado: `recordSpan`, `withRetry`, `pLimit`, `convertToBlock`, padrão `fillLayoutParallel`.
- [x] 6 primitives bem delimitadas — sem suspend/resume/persistência.
- [x] Sub-workflow `fillSlot` com `branch(bqml|sql)` e `dountil(validate, max=3)` explícitos.
- [x] Feature-flag `useWorkflowOrchestrator` com fallback ao caminho Sprint 1.B.
- [x] Acceptance critérios mensuráveis (cobertura ≥85%, LOC core ≤600, p50 não-regressivo).
- [x] Riscos com mitigações; rollback soft (flag) + hard (revert).
- [x] ADR-0003 (já existente, status Proposed) transicionada para Accepted na Task 19.
- [x] Sem dependência circular (1→2,3; 3→4; 4→5,6,7,8; 9-14 dep 1-4; 15 dep 9-14; 16 indep; 17 dep 15+16; 18 dep 17; 19 último).
- [x] Tamanho do core (`workflow/`) cap em 350-600 LOC declarado e auditado em AC.
- [x] Sem placeholders nem código em pseudocódigo: todos os snippets são compiláveis ou explicitamente marcados como esqueleto a expandir nos testes.
