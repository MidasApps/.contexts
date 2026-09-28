# WS-4 IA/DoD-2 — Batch 2 (gating de tools por cliente + firecrawl com quota) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Fechar 2 achados DoD-2 da camada de IA — gating de tools por cliente inexistente (`a6-ia-31`, DoD-2 #3) e firecrawl/search_web sem gate/rate-limit/custo (`a6-ia-33`, DoD-2 #8).

**Architecture:** `a6-ia-31` segue **exatamente** o precedente de `enabledIndicators`: um allowlist `enabledTools` (nullable) no product binding do cliente, resolvido como **união** dos bindings no `ClientSemanticContext` (null = todas as tools → back-compat), e aplicado como **interseção** das toolKeys em `createMastraAgentFromConfig` (que já recebe `ctx.semanticContext` — sem leitura Firestore extra), com observabilidade via `recordSpan`. `a6-ia-33` adiciona uma **quota diária durável por tenant no Firestore** consumida pela tool `search_web` (via nova factory `createSearchWebTool({clientId})`) com span de custo, e fecha a rota órfã `/api/firecrawl` com `requireAdmin`.

**Tech Stack:** Next.js 16 App Router, Zod, Firebase Admin SDK (Firestore, transação/quota), Mastra Agent runtime, Vitest, pnpm.

## Global Constraints

- Package manager **pnpm** (v10.32.1). Testes: `pnpm vitest run <path>`.
- Branch de trabalho: **`feat/ws4-ia-dod2-batch2`**, criada **a partir de `feat/ws4-ia-dod2-batch1`** (batch 1 / PR #47) — batch 2 empilha sobre ele porque ambos tocam `tool-registry.ts` (regiões distintas) e a camada de IA. NÃO trocar de branch durante a execução.
- `git add` **apenas** dos arquivos de cada task. NUNCA commitar `secrets/`, `.env*`, `docker-compose.yml`, `.dockerignore`, `.gitignore`, `.claude/agent-memory/`, `docs/bases/`, nem qualquer working-tree change não relacionado (tais arquivos ESTÃO presentes — não tocar).
- Nenhum script de seed/bq/rag/eval/cron/migrate; nenhuma init real de BigQuery/Firestore/Vertex; nenhum `pnpm dev`. Firestore é exercido via **fake db injetado** / mocks.
- Trailer de commit: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Decisões de design (confirmadas pelo usuário): allowlist no **product binding** (espelha `enabledIndicators`); firecrawl = **fechar rota órfã + rate-limit no tool**; rate-limit = **quota durável em Firestore por tenant**.
- Semântica de `enabledTools`: `null`/ausente em TODOS os bindings ⇒ `null` (todas as tools liberadas, back-compat); qualquer binding não-null ⇒ **união** dos arrays não-null (bindings null contribuem nada).
- Default seguro do gating: quando `ctx.semanticContext` está ausente, `enabledTools` é tratado como `null` (todas liberadas) — o gating é efetivo no caminho de produção (chat carrega o semanticContext); é defense-in-depth/capability-scoping, não o isolamento primário de tenant.
- Fonte dos achados: `docs/auditoria/2026-07-21-registro-achados.md` (`a6-ia-31`, `a6-ia-33`).

---

### Task 1: a6-ia-31 (dados) — `enabledTools` no binding + resolução no `ClientSemanticContext`

**Files:**
- Modify: `src/shared/schemas/client-binding.ts` (add `enabledTools` a `ClientProductBinding`)
- Modify: `src/shared/repositories/client-semantic-context.ts` (interface + `RawBinding` + resolução por união + retorno)
- Test: `src/shared/repositories/__tests__/client-semantic-context.test.ts` (estender)

**Interfaces:**
- Produces: `ClientProductBinding.enabledTools?: string[] | null`; `ClientSemanticContext.enabledTools: string[] | null` (união dos bindings não-null; null se todos null/ausentes).
- Consumes: harness de teste existente (`binding()` helper ~linha 159, `mocks.state.clients`).

- [ ] **Step 1: Escrever o teste que falha — RED**

Em `src/shared/repositories/__tests__/client-semantic-context.test.ts`, estender o helper `binding` (linhas ~159-178) para aceitar `enabledTools`:

```ts
function binding(
  productId: string,
  enabledIndicators: string[] | null = null,
  enabledTools: string[] | null = null,
) {
  return {
    productId,
    datasets: [
      {
        id: 'ds1',
        dataSourceId: 'src1',
        datasetId: 'dataset_x',
        contractRef: 'canonical',
        schemaBindings: {},
        schema: {},
        isPrimary: true,
      },
    ],
    enabledIndicators,
    enabledTools,
  };
}
```

E adicionar dois testes dentro de `describe('getClientSemanticContext', …)`:

```ts
  it('a6-ia-31: enabledTools resolvido como união dos bindings não-null', async () => {
    mocks.state.products = {
      prodA: product({ metricRefs: [], entityRefs: [] }),
      prodB: product({ metricRefs: [], entityRefs: [] }),
    };
    mocks.state.clients = {
      cli: { productBindings: [binding('prodA', null, ['execute_sql']), binding('prodB', null, ['search_web'])] },
    };
    const ctx = await getClientSemanticContext('cli');
    expect(ctx).not.toBeNull();
    expect([...(ctx!.enabledTools ?? [])].sort()).toEqual(['execute_sql', 'search_web']);
  });

  it('a6-ia-31: todos bindings sem enabledTools → null (todas liberadas)', async () => {
    mocks.state.products = { prodA: product({ metricRefs: [], entityRefs: [] }) };
    mocks.state.clients = { cli: { productBindings: [binding('prodA')] } };
    const ctx = await getClientSemanticContext('cli');
    expect(ctx!.enabledTools).toBeNull();
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm vitest run src/shared/repositories/__tests__/client-semantic-context.test.ts`
Expected: FAIL — `ctx.enabledTools` é `undefined` (campo não existe ainda).

- [ ] **Step 3: Adicionar `enabledTools` ao schema do binding**

Em `src/shared/schemas/client-binding.ts`, no `ClientProductBinding` (linhas ~73-78), adicionar após `enabledIndicators`:

```ts
export const ClientProductBinding = z.object({
  productId: Slug,
  datasets: z.array(ClientDatasetBinding).min(1),
  /** IDs habilitados — strings livres para aceitar tanto ProductIndicator.id quanto Metric.id. */
  enabledIndicators: z.array(z.string()).optional().nullable(),
  /**
   * Allowlist de tools da IA para este cliente (a6-ia-31). `null`/ausente = todas
   * as tools liberadas (back-compat). Não-null = só estas tool keys são
   * construídas para os agentes. Combinado por UNIÃO entre bindings no
   * `ClientSemanticContext`.
   */
  enabledTools: z.array(z.string()).optional().nullable(),
});
```

- [ ] **Step 4: Resolver `enabledTools` no `ClientSemanticContext`**

Em `src/shared/repositories/client-semantic-context.ts`:

(a) Adicionar ao `interface ClientSemanticContext` (após `dataContracts`, ~linha 39):

```ts
  /**
   * Allowlist de tools da IA (a6-ia-31). `null` = todas liberadas. Não-null =
   * união dos `enabledTools` não-null dos bindings; aplicado como interseção
   * das toolKeys em `createMastraAgentFromConfig`.
   */
  enabledTools: string[] | null;
```

(b) Adicionar ao `interface RawBinding` (~linha 42-46) o campo `enabledTools?: unknown;`.

(c) Adicionar o resolvedor (perto de `collectMetricIds`, ~linha 67):

```ts
/**
 * União dos `enabledTools` não-null dos bindings (a6-ia-31). Se nenhum binding
 * declara `enabledTools` ⇒ `null` (todas as tools liberadas, back-compat).
 */
function resolveEnabledTools(bindings: RawBinding[]): string[] | null {
  let anyDeclared = false;
  const union = new Set<string>();
  for (const b of bindings) {
    if (Array.isArray(b.enabledTools)) {
      anyDeclared = true;
      for (const t of readStringArray(b.enabledTools)) union.add(t);
    }
  }
  return anyDeclared ? Array.from(union) : null;
}
```

(d) No corpo de `getClientSemanticContext`, após montar `rawBindings` (~linha 81), computar `const enabledTools = resolveEnabledTools(rawBindings);` e incluí-lo no objeto de retorno final (linha ~239):

```ts
    return { clientId, metrics, dataContracts, enabledTools };
```

- [ ] **Step 5: Rodar e confirmar verde**

Run: `pnpm vitest run src/shared/repositories/__tests__/client-semantic-context.test.ts`
Expected: PASS (novos + existentes; os testes existentes que checam o objeto retornado continuam válidos — `enabledTools` é campo adicional).

- [ ] **Step 6: Typecheck + commit**

`ClientSemanticContext` ganhou um campo obrigatório (`enabledTools`). Confirmar que nenhum literal de `ClientSemanticContext` em teste/código quebra:

Run: `pnpm exec tsc --noEmit`
Expected: sem erros. Se um literal de teste de `ClientSemanticContext` acusar falta de `enabledTools`, adicionar `enabledTools: null` a ele (será tratado na Task 2 para o create-mastra test; aqui, corrigir só o que o tsc apontar neste escopo).

```bash
git add src/shared/schemas/client-binding.ts \
        src/shared/repositories/client-semantic-context.ts \
        src/shared/repositories/__tests__/client-semantic-context.test.ts
git commit
```

Mensagem: `feat(tenancy): enabledTools por cliente no binding + resolução no ClientSemanticContext (a6-ia-31)` + trailer.

---

### Task 2: a6-ia-31 (runtime) — gating de tools na criação do agente + observabilidade

`createMastraAgentFromConfig` já recebe `ctx.semanticContext`. Interseccionar as toolKeys resolvidas com `ctx.semanticContext.enabledTools` (quando não-null) antes de `buildToolsFromKeys`, emitindo um span das tools barradas (observabilidade = DoD-2 #3).

**Files:**
- Modify: `src/features/ai-agents/mastra/create-mastra-agent-from-config.ts`
- Test: `src/features/ai-agents/mastra/create-mastra-agent-from-config.test.ts` (estender)

**Interfaces:**
- Consumes: `ctx.semanticContext?.enabledTools` (Task 1); `buildToolsFromKeys(keys, ctx, systemKey)`; `recordSpan`.
- Produces: `buildToolsFromKeys` passa a receber as toolKeys **já interseccionadas** quando o tenant tem allowlist.

- [ ] **Step 1: Escrever o teste que falha — RED**

Em `src/features/ai-agents/mastra/create-mastra-agent-from-config.test.ts`, adicionar dentro de `describe('createMastraAgentFromConfig', …)`:

```ts
  it('a6-ia-31: enabledTools não-null intersecta as toolKeys passadas ao buildToolsFromKeys', async () => {
    h.resolveCapsMock.mockResolvedValue({ toolKeys: ['execute_sql', 'calculate_hhi'], kbRefs: [] });
    const scCtx = {
      clientId: 'OM', personaId: 'p', dataset: 'om', filters: {}, sessionId: 's',
      semanticContext: { clientId: 'OM', metrics: [], dataContracts: [], enabledTools: ['execute_sql'] },
    } as never;
    await createMastraAgentFromConfig(input({ ctx: scCtx }));
    expect(h.buildFromKeysMock).toHaveBeenCalledWith(['execute_sql'], scCtx, 'diagnostic');
  });

  it('a6-ia-31: enabledTools null → todas as toolKeys passam (back-compat)', async () => {
    h.resolveCapsMock.mockResolvedValue({ toolKeys: ['execute_sql', 'calculate_hhi'], kbRefs: [] });
    const scCtx = {
      clientId: 'OM', personaId: 'p', dataset: 'om', filters: {}, sessionId: 's',
      semanticContext: { clientId: 'OM', metrics: [], dataContracts: [], enabledTools: null },
    } as never;
    await createMastraAgentFromConfig(input({ ctx: scCtx }));
    expect(h.buildFromKeysMock).toHaveBeenCalledWith(['execute_sql', 'calculate_hhi'], scCtx, 'diagnostic');
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm vitest run src/features/ai-agents/mastra/create-mastra-agent-from-config.test.ts`
Expected: FAIL no 1º teste novo — hoje `buildToolsFromKeys` recebe `['execute_sql','calculate_hhi']` (sem interseção).

- [ ] **Step 3: Implementar a interseção + span**

Em `src/features/ai-agents/mastra/create-mastra-agent-from-config.ts`:

(a) Adicionar o import (junto aos demais, ~linha 10):

```ts
import { recordSpan } from '@/shared/lib/telemetry/record-span';
```

(b) Substituir o trecho que resolve `toolKeys` e chama `buildToolsFromKeys` (linhas ~49-51):

```ts
  const caps = await resolveAgentCapabilities(systemKey);
  const toolKeys = caps.toolKeys.length > 0 ? caps.toolKeys : (DEFAULT_AGENT_TOOLS[systemKey] ?? []);
  const tools = buildToolsFromKeys(toolKeys, ctx, systemKey) as Record<string, unknown>;
```

por:

```ts
  const caps = await resolveAgentCapabilities(systemKey);
  const baseToolKeys = caps.toolKeys.length > 0 ? caps.toolKeys : (DEFAULT_AGENT_TOOLS[systemKey] ?? []);

  // a6-ia-31: gating de tools por cliente (interseção com o allowlist do tenant).
  // enabledTools null/ausente ⇒ todas liberadas (back-compat). Span das barradas.
  const enabledTools = ctx.semanticContext?.enabledTools ?? null;
  let toolKeys = baseToolKeys;
  if (Array.isArray(enabledTools)) {
    const allow = new Set(enabledTools);
    const removed = baseToolKeys.filter((k) => !allow.has(k));
    toolKeys = baseToolKeys.filter((k) => allow.has(k));
    if (removed.length > 0) {
      void recordSpan(
        {
          name: 'ai.tool_gating.per_client',
          attributes: { clientId: (ctx as { clientId?: string }).clientId ?? 'unknown', systemKey, removed, kept: toolKeys },
        },
        () => undefined,
      );
    }
  }

  const tools = buildToolsFromKeys(toolKeys, ctx, systemKey) as Record<string, unknown>;
```

- [ ] **Step 4: Rodar e confirmar verde**

Run: `pnpm vitest run src/features/ai-agents/mastra/create-mastra-agent-from-config.test.ts`
Expected: PASS (novos + existentes; o teste existente "config vazia → DEFAULT_AGENT_TOOLS" usa `ctx` sem semanticContext ⇒ `enabledTools` null ⇒ toolKeys inalteradas, segue verde).

- [ ] **Step 5: Suíte adjacente + commit**

Run: `pnpm vitest run src/features/ai-agents/mastra`
Expected: PASS.

```bash
git add src/features/ai-agents/mastra/create-mastra-agent-from-config.ts \
        src/features/ai-agents/mastra/create-mastra-agent-from-config.test.ts
git commit
```

Mensagem: `feat(ai): gating de tools por cliente na criação do agente + span de observabilidade (a6-ia-31, DoD-2 #3)` + trailer.

---

### Task 3: a6-ia-33 (mecanismo) — quota diária durável por tenant no Firestore

Helper puro + glue Firestore para uma quota diária por tenant, consumida transacionalmente (nega quando atinge o limite, senão incrementa).

**Files:**
- Create: `src/features/ai-agents/lib/search-quota.ts`
- Test: `src/features/ai-agents/lib/__tests__/search-quota.test.ts` (novo)

**Interfaces:**
- Produces: `quotaDocId(clientId, now): string`; `defaultDailyLimit(): number`; `consumeSearchQuota({ clientId, limit?, now?, db? }): Promise<{ allowed: boolean; used: number; limit: number }>`.

- [ ] **Step 1: Escrever o teste que falha — RED**

Criar `src/features/ai-agents/lib/__tests__/search-quota.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { quotaDocId, defaultDailyLimit, consumeSearchQuota } from '../search-quota';

/** Fake Firestore mínimo com runTransaction + doc get/set em memória. */
function makeFakeDb(store: Record<string, { count?: number }>) {
  return {
    collection: () => ({
      doc: (id: string) => ({ __id: id }),
    }),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        get: async (ref: { __id: string }) => ({
          exists: store[ref.__id] !== undefined,
          data: () => store[ref.__id],
        }),
        set: (ref: { __id: string }, data: { count?: number }) => {
          store[ref.__id] = { ...(store[ref.__id] ?? {}), ...data };
        },
      };
      return fn(tx);
    },
  } as unknown as FirebaseFirestore.Firestore;
}

describe('search-quota (a6-ia-33)', () => {
  const now = new Date('2026-07-22T10:00:00Z');

  it('quotaDocId: por tenant + dia, sanitizando o id', () => {
    expect(quotaDocId('vila-rosa', now)).toBe('vila-rosa__2026-07-22');
    expect(quotaDocId('', now)).toBe('unknown__2026-07-22');
  });

  it('defaultDailyLimit: env válido sobrepõe; senão 50', () => {
    expect(defaultDailyLimit()).toBeGreaterThan(0);
  });

  it('abaixo do limite: permite e incrementa', async () => {
    const store: Record<string, { count?: number }> = {};
    const db = makeFakeDb(store);
    const r1 = await consumeSearchQuota({ clientId: 'OM', limit: 2, now, db });
    expect(r1).toEqual({ allowed: true, used: 1, limit: 2 });
    const r2 = await consumeSearchQuota({ clientId: 'OM', limit: 2, now, db });
    expect(r2).toEqual({ allowed: true, used: 2, limit: 2 });
  });

  it('no limite: nega sem incrementar além', async () => {
    const store: Record<string, { count?: number }> = { 'om__2026-07-22': { count: 2 } };
    const db = makeFakeDb(store);
    const r = await consumeSearchQuota({ clientId: 'OM', limit: 2, now, db });
    expect(r).toEqual({ allowed: false, used: 2, limit: 2 });
    expect(store['om__2026-07-22'].count).toBe(2); // não incrementa
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm vitest run src/features/ai-agents/lib/__tests__/search-quota.test.ts`
Expected: FAIL — módulo `../search-quota` não existe.

- [ ] **Step 3: Implementar o helper**

Criar `src/features/ai-agents/lib/search-quota.ts`:

```ts
import 'server-only';
import { getDb } from '@/shared/lib/firebase/admin';

const COLLECTION = 'searchWebQuota';

/** Doc id da quota: `<tenant-sanitizado>__YYYY-MM-DD`. */
export function quotaDocId(clientId: string, now: Date): string {
  const day = now.toISOString().slice(0, 10);
  const safe = (clientId || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'unknown';
  return `${safe}__${day}`;
}

/** Limite diário por tenant. Env `FIRECRAWL_DAILY_LIMIT` (int > 0) sobrepõe; default 50. */
export function defaultDailyLimit(): number {
  const raw = process.env.FIRECRAWL_DAILY_LIMIT;
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 50;
}

export interface QuotaResult {
  allowed: boolean;
  used: number;
  limit: number;
}

/**
 * Consome 1 unidade da quota diária de search do tenant (durável, Firestore).
 * Transação: nega quando `count >= limit`; senão incrementa. `db`/`now`/`limit`
 * injetáveis para teste.
 */
export async function consumeSearchQuota(args: {
  clientId: string;
  limit?: number;
  now?: Date;
  db?: FirebaseFirestore.Firestore;
}): Promise<QuotaResult> {
  const db = args.db ?? getDb();
  const limit = args.limit ?? defaultDailyLimit();
  const now = args.now ?? new Date();
  const ref = db.collection(COLLECTION).doc(quotaDocId(args.clientId, now));

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const used = snap.exists ? Number((snap.data() as { count?: unknown } | undefined)?.count) || 0 : 0;
    if (used >= limit) {
      return { allowed: false, used, limit };
    }
    tx.set(
      ref,
      {
        count: used + 1,
        clientId: args.clientId || 'unknown',
        day: now.toISOString().slice(0, 10),
        updatedAt: now.toISOString(),
      },
      { merge: true },
    );
    return { allowed: true, used: used + 1, limit };
  });
}
```

- [ ] **Step 4: Rodar e confirmar verde**

Run: `pnpm vitest run src/features/ai-agents/lib/__tests__/search-quota.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/ai-agents/lib/search-quota.ts \
        src/features/ai-agents/lib/__tests__/search-quota.test.ts
git commit
```

Mensagem: `feat(ai): quota diária durável por tenant para search web (a6-ia-33, DoD-2 #8)` + trailer.

---

### Task 4: a6-ia-33 (aplicação) — `search_web` com quota+custo, wiring, e fechar `/api/firecrawl`

**Files:**
- Modify: `src/features/ai-agents/tools/search-web.ts` (factory `createSearchWebTool` + export back-compat)
- Modify: `src/features/ai-studio/runtime/tool-registry.ts` (import + mapping `search_web` com `ctx.clientId`)
- Modify: `app/api/firecrawl/route.ts` (gate `requireAdmin`)
- Test: `src/features/ai-agents/tools/__tests__/search-web.test.ts` (novo)

**Interfaces:**
- Consumes: `consumeSearchQuota` (Task 3); `recordSpan`; `requireAdmin`/`isAdminAuthOk`.
- Produces: `createSearchWebTool(opts?: { clientId?: string })` → tool; `searchWebTool = createSearchWebTool()` (back-compat, bucket `unknown`); registry usa `ctx.clientId`; `/api/firecrawl` exige admin.

Nota de blast radius: `searchWebTool` é importado direto por `src/features/ai-agents/agents/external-agent.ts` e `src/features/canvas-orchestrator/lib/sub-agent.ts` (caminhos legados). Manter o export `searchWebTool` preserva esses call sites sem mudança (usam o bucket `unknown`). Só o registry (caminho vivo) passa a usar a factory com `clientId`.

- [ ] **Step 1: Escrever o teste que falha — RED**

Criar `src/features/ai-agents/tools/__tests__/search-web.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { consumeMock, searchMock } = vi.hoisted(() => ({
  consumeMock: vi.fn(),
  searchMock: vi.fn(),
}));
vi.mock('@/features/ai-agents/lib/search-quota', () => ({ consumeSearchQuota: consumeMock }));
vi.mock('@mendable/firecrawl-js', () => ({
  default: vi.fn(function () { return { search: searchMock }; }),
}));

import { createSearchWebTool } from '../search-web';

function run(tool: unknown, query: string) {
  return (tool as { execute: (a: { query: string }) => Promise<unknown> }).execute({ query });
}

describe('createSearchWebTool (a6-ia-33)', () => {
  beforeEach(() => {
    consumeMock.mockReset();
    searchMock.mockReset();
    process.env.FIRECRAWL_API_KEY = 'k';
  });

  it('quota excedida → não chama firecrawl e retorna erro claro', async () => {
    consumeMock.mockResolvedValueOnce({ allowed: false, used: 50, limit: 50 });
    const res = (await run(createSearchWebTool({ clientId: 'OM' }), 'x')) as { success: boolean; data: unknown[] };
    expect(res.success).toBe(false);
    expect(searchMock).not.toHaveBeenCalled();
    expect(consumeMock).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'OM' }));
  });

  it('quota ok → chama firecrawl e retorna resultados', async () => {
    consumeMock.mockResolvedValueOnce({ allowed: true, used: 1, limit: 50 });
    searchMock.mockResolvedValueOnce({ success: true, data: [{ url: 'u', title: 't', markdown: 'm' }] });
    const res = (await run(createSearchWebTool({ clientId: 'OM' }), 'x')) as { success: boolean; data: Array<{ url: string }> };
    expect(res.success).toBe(true);
    expect(res.data[0].url).toBe('u');
    expect(searchMock).toHaveBeenCalled();
  });

  it('sem clientId → usa bucket "unknown"', async () => {
    consumeMock.mockResolvedValueOnce({ allowed: true, used: 1, limit: 50 });
    searchMock.mockResolvedValueOnce({ success: true, data: [] });
    await run(createSearchWebTool(), 'x');
    expect(consumeMock).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'unknown' }));
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm vitest run src/features/ai-agents/tools/__tests__/search-web.test.ts`
Expected: FAIL — `createSearchWebTool` não é exportado.

- [ ] **Step 3: Converter `search-web.ts` em factory**

Substituir o conteúdo de `src/features/ai-agents/tools/search-web.ts` por:

```ts
import { tool } from 'ai';
import { formatToolError } from '@/features/ai-agents/lib/format-error';
import { recordSpan } from '@/shared/lib/telemetry/record-span';
import { consumeSearchQuota } from '@/features/ai-agents/lib/search-quota';
import { z } from 'zod';

type SearchResult = { url: string; title: string; content: string };

/**
 * Cria a tool `search_web` escopada a um tenant (a6-ia-33): consome quota diária
 * durável por cliente e emite span de custo. `clientId` ausente ⇒ bucket
 * compartilhado `unknown` (caminhos legados). Nunca lança — degrada para
 * `{ success:false }`.
 */
export function createSearchWebTool(opts: { clientId?: string } = {}) {
  const clientId = opts.clientId ?? 'unknown';
  return tool({
    description:
      'Search the web for up-to-date information. Returns a list of relevant results with URLs, titles, and content snippets.',
    inputSchema: z.object({
      query: z.string().describe('The search query to look up on the web.'),
    }),
    execute: async ({ query }: { query: string }) =>
      recordSpan(
        { name: 'tool.search_web', attributes: { clientId, query: query.slice(0, 120) } },
        async (): Promise<{ success: boolean; error?: string; data: SearchResult[] }> => {
          const quota = await consumeSearchQuota({ clientId }).catch(() => null);
          if (quota && !quota.allowed) {
            return {
              success: false,
              error: `Limite diário de buscas web atingido para este cliente (${quota.used}/${quota.limit}).`,
              data: [],
            };
          }

          const apiKey = process.env.FIRECRAWL_API_KEY;
          if (!apiKey) {
            return { success: false, error: 'FIRECRAWL_API_KEY environment variable is not set.', data: [] };
          }
          try {
            const Firecrawl = (await import('@mendable/firecrawl-js')).default;
            const app = new Firecrawl({ apiKey });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const response = await (app as any).search(query, { limit: 5 });
            if (!response || !response.success) {
              return { success: false, error: 'Firecrawl search returned an error.', data: [] };
            }
            const data = ((response.data ?? []) as Array<{
              url?: string;
              title?: string;
              markdown?: string;
              description?: string;
            }>).map((item) => ({
              url: item.url ?? '',
              title: item.title ?? '',
              content: (item.markdown ?? item.description ?? '').substring(0, 2000),
            }));
            return { success: true, data };
          } catch (err) {
            return { success: false, error: formatToolError(err), data: [] };
          }
        },
      ),
  });
}

/** Back-compat: export estático (bucket `unknown`) para os call sites legados. */
export const searchWebTool = createSearchWebTool();
```

- [ ] **Step 4: Rodar e confirmar verde**

Run: `pnpm vitest run src/features/ai-agents/tools/__tests__/search-web.test.ts`
Expected: PASS.

- [ ] **Step 5: Wiring no registry (caminho vivo usa `clientId`)**

Em `src/features/ai-studio/runtime/tool-registry.ts`:
- Linha ~68: trocar o import `import { searchWebTool } from '@/features/ai-agents/tools/search-web';` por `import { createSearchWebTool } from '@/features/ai-agents/tools/search-web';`
- Linha ~162: trocar `search_web: () => searchWebTool,` por `search_web: (ctx) => createSearchWebTool({ clientId: ctx.clientId }),`

- [ ] **Step 6: Fechar a rota órfã `/api/firecrawl` com `requireAdmin`**

Em `app/api/firecrawl/route.ts`, substituir o bloco de auth inline (linhas ~1-2 imports e ~14-25 verifyIdToken) para usar `requireAdmin`. Novo topo do arquivo + início do POST:

```ts
import { NextRequest, NextResponse } from 'next/server';
import Firecrawl from '@mendable/firecrawl-js';
import { requireAdmin, isAdminAuthOk } from '@/shared/lib/auth/require-admin';

const getFirecrawlClient = () => {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    throw new Error('FIRECRAWL_API_KEY nao configurada');
  }
  return new Firecrawl({ apiKey });
};

export async function POST(req: NextRequest) {
  // a6-ia-33: rota sem caller no app (órfã) → restrita a admin global.
  const auth = await requireAdmin(req);
  if (!isAdminAuthOk(auth)) return auth;
  try {
    const body = await req.json();
    const { action, ...params } = body;
    const client = getFirecrawlClient();
    // ... (restante do switch action inalterado) ...
```

Manter TODO o restante do handler (o `switch (action)` com `search`/`scrape`/default e o `catch` final) exatamente como está. Remover o import side-effect `import '@/shared/lib/firebase/admin';` e o bloco `authHeader`/`verifyIdToken` (substituídos por `requireAdmin`).

- [ ] **Step 7: Verificar que os call sites legados de `searchWebTool` ainda compilam**

`searchWebTool` continua exportado (factory sem args). Confirmar via typecheck que `external-agent.ts` e `sub-agent.ts` seguem válidos:

Run: `pnpm exec tsc --noEmit`
Expected: sem erros.

- [ ] **Step 8: Suíte relevante + commit**

Run: `pnpm vitest run src/features/ai-agents/tools src/features/ai-studio/runtime`
Expected: PASS.

```bash
git add src/features/ai-agents/tools/search-web.ts \
        src/features/ai-studio/runtime/tool-registry.ts \
        app/api/firecrawl/route.ts \
        src/features/ai-agents/tools/__tests__/search-web.test.ts
git commit
```

Mensagem: `fix(ai): search_web com quota+custo por tenant e /api/firecrawl restrito a admin (a6-ia-33, DoD-2 #8)` + trailer.

---

## Self-Review

**Spec coverage:**
- `a6-ia-31` → Task 1 (dados: allowlist no binding + resolução) + Task 2 (runtime: interseção + span). DoD-2 #3 (funciona + observável). ✅
- `a6-ia-33` → Task 3 (quota durável Firestore) + Task 4 (tool com quota/custo + rota órfã fechada). DoD-2 #8 (custo/rate-limit). ✅
- Fora deste batch: `a6-ia-02` (stream do chat — systematic-debugging), `a6-ia-32` (orchestrator-metrics stub), `a6-ia-09` (PII), `a6-ia-06/07/08/10`.

**Placeholder scan:** todo step tem código real. Sem TODO/TBD.

**Type consistency:** `enabledTools` é `string[] | null` idêntico no schema (`ClientProductBinding`), na interface (`ClientSemanticContext`), no resolvedor (`resolveEnabledTools`), no consumo (`ctx.semanticContext?.enabledTools`) e nos testes. `consumeSearchQuota` retorna `{ allowed, used, limit }` idêntico entre helper, mock de teste e uso em `createSearchWebTool`. `createSearchWebTool(opts?: { clientId?: string })` idêntico entre definição, registry e testes.

**Risco anotado (Task 1, Step 6 / Task 2):** `ClientSemanticContext` ganhou campo obrigatório `enabledTools` — literais existentes desse tipo (ex.: o create-mastra test) precisam de `enabledTools` (Task 2 já inclui nos ctx dos testes novos; o tsc aponta os demais). Adicionar `enabledTools: null` onde faltar.
**Risco anotado (Task 4):** `searchWebTool` importado por 3 sites; manter o export estático preserva os 2 legados. O `tsc --noEmit` (Step 7) confirma.

## Execution Handoff

Plano salvo em `docs/superpowers/plans/2026-07-22-ws4-ia-dod2-batch2.md`. Execução: **Subagent-Driven**, consistente com o batch 1.
