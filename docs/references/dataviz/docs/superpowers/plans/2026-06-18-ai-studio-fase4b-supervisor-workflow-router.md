# AI Studio Fase 4B — Supervisor + Roteador de Workflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Atrás de `AI_STUDIO_WORKFLOWS`, rotear o comando do usuário a um workflow (pela descrição "quando usar") e rodar um supervisor Mastra que compõe os 8 sub-agentes com `buildOrchestratorPrompt + workflow.instruction`, mais o enforcement de exatamente-1-default no CRUD de workflows.

**Architecture:** `loadWorkflows()` (cacheado) + `selectWorkflow()` (roteador LLM, fallback default) + `buildSupervisorAgent()` (Agent Mastra com `agents` nativo = os 8 sub-agentes). O `/api/chat` seleciona o supervisor em vez do descriptive quando a flag está on; fail-soft → descriptive. Enforcement de 1-default no `AiStudioRepo` (patch+upsert).

**Tech Stack:** Next.js 16, `@mastra/core` (Agent), `ai` SDK (generateObject), `@ai-sdk/google-vertex`, Firestore (firebase-admin), Vitest 4.

## Global Constraints

- **Supervisor via `agents` nativo do Mastra** (`new Agent({ agents: {…8} })`), sem agent-as-tool manual.
- **System prompt do supervisor = compor:** `buildOrchestratorPrompt(ctx)` + `'\n\n'` + `workflow.instruction`. Model `getModel('router')` (gemini-2.5-flash-lite), espelhando o supervisor legado.
- **Supervisor construído na rota** (instruções dependem do workflow runtime), NÃO no `buildMastraInstance`.
- **Roteador fail-soft:** `selectWorkflow` nunca lança para a rota; falha/sem-match/id-inválido → `isDefault` (ou 1º ativo). A rota também envolve o bloco em try/catch → descriptive.
- **Enforcement 1-default (só `type==='workflow'`):** setar `isDefault:true` desmarca os demais (batch atômico); desmarcar o único default → lança (fail-loud no CRUD). Vale em **patch E upsert**.
- **`/api/chat` flag off → idêntico ao atual** (descriptive solo). `AI_STUDIO_WORKFLOWS` env é o SoT; `useAiStudioWorkflows` no app-store é paridade.
- **NÃO tocar:** `orchestrator.ts` legado, os `createXAgent`, os 8 Mastra factories da 4A, `buildMastraInstance`.
- **Reaproveitar:** `getModel`/`getProviderOptions` (`@/features/ai-agents/model-registry`), `buildOrchestratorPrompt` (`@/shared/config/agents`), `AiStudioRepo` (`@/features/ai-studio/repo`), TTL cache do `config-loader`.
- **Testes:** Vitest; `vi.hoisted`/`vi.mock`; rota com `/* @vitest-environment node */`. Firestore/Agent/generateObject mockados. **Rodar `pnpm build`** na task de wiring (type-check completo — lição da Fase 2).
- **Sem ADR/flag-extra nova além de `AI_STUDIO_WORKFLOWS`.** Sem índice composto novo (`where isDefault==true` é single-field).

---

## File Structure

```
src/features/ai-studio/runtime/config-loader.ts        MODIFY — + loadWorkflows()
src/features/ai-studio/runtime/select-workflow.ts      CREATE — selectWorkflow(command, workflows)
src/features/ai-studio/runtime/select-workflow.test.ts CREATE
src/features/ai-agents/mastra/build-supervisor-agent.ts CREATE — buildSupervisorAgent(...)
src/features/ai-agents/mastra/build-supervisor-agent.test.ts CREATE
src/features/ai-studio/repo.ts                         MODIFY — enforcement 1-default (patch+upsert)
src/features/ai-studio/repo-default-workflow.test.ts   CREATE
app/api/chat/route.ts                                  MODIFY — wiring atrás de AI_STUDIO_WORKFLOWS
src/shared/stores/app-store.ts                         MODIFY — flag useAiStudioWorkflows
src/features/ai-studio/runtime/config-loader.test.ts   MODIFY — + loadWorkflows cases
```

---

### Task 1: `loadWorkflows()` no config-loader

**Files:**
- Modify: `src/features/ai-studio/runtime/config-loader.ts`
- Modify: `src/features/ai-studio/runtime/config-loader.test.ts`

**Interfaces:**
- Consumes: `AiStudioRepo` (`../repo`); o `cache`/`TTL_MS` já existentes no módulo.
- Produces: `loadWorkflows(): Promise<AiStudioRecord[]>` — workflows `status==='active'`, cacheados sob a chave fixa `'__workflows__'` (TTL 30s).

- [ ] **Step 1: Escrever o teste (falhando)** — adicionar ao `config-loader.test.ts` existente

```typescript
describe('loadWorkflows', () => {
  it('lista só workflows active e cacheia (2ª chamada não re-busca)', async () => {
    // O mock de AiStudioRepo no topo do arquivo controla `list`. Para workflows,
    // faça `list` retornar uma mistura active/archived e conte as chamadas.
    const listSpy = getMock; // o vi.fn() hoisted que respaldo AiStudioRepo.list (ver topo do arquivo)
    listSpy.mockReset();
    listSpy.mockResolvedValue([
      { id: 'default', status: 'active', isDefault: true, instruction: 'i', description: 'd' },
      { id: 'old', status: 'archived', isDefault: false, instruction: '', description: '' },
    ]);
    const { loadWorkflows } = await import('./config-loader');
    const a = await loadWorkflows();
    expect(a.map((w) => w.id)).toEqual(['default']);   // só active
    const before = listSpy.mock.calls.length;
    await loadWorkflows();
    expect(listSpy.mock.calls.length).toBe(before);    // cache hit, sem nova busca
  });
});
```

> Nota: o `config-loader.test.ts` já mocka `../repo` (`AiStudioRepo` → `{ get, list }` via `vi.hoisted`). Reuse o mesmo `list` mock. Se o mock atual só expõe `get`, estenda-o para incluir `list: vi.fn()` no factory hoisted (sem alterar os testes existentes).

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test src/features/ai-studio/runtime/config-loader.test.ts`
Expected: FAIL (`loadWorkflows` não existe).

- [ ] **Step 3: Implementar** — adicionar ao `config-loader.ts`

```typescript
const WORKFLOWS_CACHE_KEY = '__workflows__';
const workflowsCache = new Map<string, { at: number; value: AiStudioRecord[] }>();

/** Lista os workflows `active` do Firestore, cacheado por TTL. */
export async function loadWorkflows(): Promise<AiStudioRecord[]> {
  const now = Date.now();
  const hit = workflowsCache.get(WORKFLOWS_CACHE_KEY);
  if (hit && now - hit.at < TTL_MS) return hit.value;
  const all = await new AiStudioRepo('workflow').list();
  const active = all.filter((w) => (w.status as string) === 'active');
  workflowsCache.set(WORKFLOWS_CACHE_KEY, { at: now, value: active });
  return active;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test src/features/ai-studio/runtime/config-loader.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/ai-studio/runtime/config-loader.ts src/features/ai-studio/runtime/config-loader.test.ts
git commit -m "feat(ai-studio): loadWorkflows() cacheado (workflows active) no config-loader"
```

---

### Task 2: `selectWorkflow` (roteador)

**Files:**
- Create: `src/features/ai-studio/runtime/select-workflow.ts`
- Test: `src/features/ai-studio/runtime/select-workflow.test.ts`

**Interfaces:**
- Consumes: `generateObject` (`ai`), `z` (`zod`), `getModel` (`@/features/ai-agents/model-registry`), `AiStudioRecord` (`../repo`).
- Produces: `selectWorkflow(command: string, workflows: AiStudioRecord[]): Promise<AiStudioRecord>` — escolhe pelo `description`; fallback `isDefault` (ou 1º). Nunca lança.

- [ ] **Step 1: Escrever o teste (falhando)**

`src/features/ai-studio/runtime/select-workflow.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { generateObjectMock } = vi.hoisted(() => ({ generateObjectMock: vi.fn() }));
vi.mock('ai', () => ({ generateObject: generateObjectMock }));
vi.mock('@/features/ai-agents/model-registry', () => ({ getModel: () => 'ROUTER_MODEL' }));

import { selectWorkflow } from './select-workflow';

const wfs = [
  { id: 'default', status: 'active', isDefault: true, instruction: 'i-def', description: 'fluxo padrão' },
  { id: 'inadimplencia', status: 'active', isDefault: false, instruction: 'i-inad', description: 'quando o comando é sobre inadimplência/atraso' },
] as never[];

beforeEach(() => generateObjectMock.mockReset());

describe('selectWorkflow', () => {
  it('um único workflow → retorna sem chamar o LLM', async () => {
    const out = await selectWorkflow('qualquer', [wfs[0]]);
    expect(out.id).toBe('default');
    expect(generateObjectMock).not.toHaveBeenCalled();
  });

  it('casa pelo id retornado pelo roteador', async () => {
    generateObjectMock.mockResolvedValueOnce({ object: { workflowId: 'inadimplencia' } });
    const out = await selectWorkflow('por que a inadimplência subiu?', wfs);
    expect(out.id).toBe('inadimplencia');
  });

  it('id inválido → fallback ao default', async () => {
    generateObjectMock.mockResolvedValueOnce({ object: { workflowId: 'nao-existe' } });
    const out = await selectWorkflow('x', wfs);
    expect(out.id).toBe('default');
  });

  it('erro do roteador → fallback ao default (fail-soft)', async () => {
    generateObjectMock.mockRejectedValueOnce(new Error('vertex down'));
    const out = await selectWorkflow('x', wfs);
    expect(out.id).toBe('default');
  });

  it('sem default → fallback ao 1º ativo', async () => {
    generateObjectMock.mockRejectedValueOnce(new Error('down'));
    const noDefault = [{ ...wfs[1] }, { id: 'b', status: 'active', isDefault: false, instruction: '', description: 'b' }] as never[];
    const out = await selectWorkflow('x', noDefault);
    expect(out.id).toBe('inadimplencia');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test src/features/ai-studio/runtime/select-workflow.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`src/features/ai-studio/runtime/select-workflow.ts`:

```typescript
import { generateObject } from 'ai';
import { z } from 'zod';
import { getModel } from '@/features/ai-agents/model-registry';
import type { AiStudioRecord } from '../repo';

const RouteSchema = z.object({ workflowId: z.string() });

/**
 * Escolhe o workflow mais adequado ao comando pela sua `description` ("quando
 * usar"), via um roteador LLM barato (tier 'router'). Fail-soft: qualquer
 * falha, sem-match ou id inválido → o workflow `isDefault` (ou o 1º ativo).
 * Nunca lança.
 */
export async function selectWorkflow(
  command: string,
  workflows: AiStudioRecord[],
): Promise<AiStudioRecord> {
  const fallback = workflows.find((w) => w.isDefault === true) ?? workflows[0];
  if (workflows.length <= 1) return fallback;
  try {
    const { object } = await generateObject({
      model: getModel('router'),
      schema: RouteSchema,
      temperature: 0,
      prompt: [
        'Escolha o workflow mais adequado ao comando do usuário.',
        `Comando: ${command}`,
        '',
        'Workflows disponíveis (id — quando usar):',
        ...workflows.map((w) => `${w.id} — ${String(w.description ?? '')}`),
        '',
        'Responda com o workflowId EXATO de um item da lista.',
      ].join('\n'),
    });
    return workflows.find((w) => w.id === object.workflowId) ?? fallback;
  } catch {
    return fallback;
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test src/features/ai-studio/runtime/select-workflow.test.ts`
Expected: PASS (5/5).

- [ ] **Step 5: Commit**

```bash
git add src/features/ai-studio/runtime/select-workflow.ts src/features/ai-studio/runtime/select-workflow.test.ts
git commit -m "feat(ai-studio): selectWorkflow — roteador por descrição com fallback ao default"
```

---

### Task 3: `buildSupervisorAgent`

**Files:**
- Create: `src/features/ai-agents/mastra/build-supervisor-agent.ts`
- Test: `src/features/ai-agents/mastra/build-supervisor-agent.test.ts`

**Interfaces:**
- Consumes: `Agent` (`@mastra/core/agent`), `getModel` (`@/features/ai-agents/model-registry`), `buildOrchestratorPrompt` (`@/shared/config/agents`), `AgentDynamicContext`.
- Produces: `buildSupervisorAgent(input: { instruction: string; ctx: AgentDynamicContext; subAgents: Record<string, unknown> }): Agent` — síncrono.

- [ ] **Step 1: Escrever o teste (falhando)**

`src/features/ai-agents/mastra/build-supervisor-agent.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ promptMock: vi.fn(() => 'BASE_ORCH'), getModelMock: vi.fn(() => 'ROUTER') }));
vi.mock('@/shared/config/agents', () => ({ buildOrchestratorPrompt: h.promptMock }));
vi.mock('@/features/ai-agents/model-registry', () => ({ getModel: h.getModelMock }));
vi.mock('@mastra/core/agent', () => ({ Agent: vi.fn(function (cfg: unknown) { return { cfg }; }) }));

import { buildSupervisorAgent } from './build-supervisor-agent';
import { Agent } from '@mastra/core/agent';

const ctx = { dataset: 'om', filters: {}, sessionId: 's' } as never;
const subAgents = { descriptive: {}, diagnostic: {} } as never;
function lastCfg() {
  return (Agent as unknown as { mock: { calls: Array<[{ id: string; instructions: string; agents: unknown; model: unknown }]> } }).mock.calls.at(-1)![0];
}
beforeEach(() => { h.promptMock.mockClear(); (Agent as unknown as { mockClear: () => void }).mockClear(); });

describe('buildSupervisorAgent', () => {
  it('compõe buildOrchestratorPrompt + instruction; agents = subAgents; id supervisor; model router', () => {
    buildSupervisorAgent({ instruction: 'WF_INSTR', ctx, subAgents });
    const cfg = lastCfg();
    expect(cfg.id).toBe('supervisor');
    expect(cfg.instructions).toBe('BASE_ORCH\n\nWF_INSTR');
    expect(cfg.agents).toBe(subAgents);
    expect(cfg.model).toBe('ROUTER');
    expect(h.getModelMock).toHaveBeenCalledWith('router');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test src/features/ai-agents/mastra/build-supervisor-agent.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`src/features/ai-agents/mastra/build-supervisor-agent.ts`:

```typescript
import { Agent } from '@mastra/core/agent';
import { buildOrchestratorPrompt } from '@/shared/config/agents';
import { getModel } from '@/features/ai-agents/model-registry';
import type { AgentDynamicContext } from '@/shared/config/agents/types';

export interface SupervisorAgentInput {
  instruction: string;                  // workflow.instruction
  ctx: AgentDynamicContext;
  subAgents: Record<string, unknown>;   // os 8 Mastra Agents (mastra.getAgent)
}

/**
 * Supervisor Mastra: compõe os sub-agentes (via `agents` nativo) e roda com
 * buildOrchestratorPrompt(ctx) + a instrução do workflow selecionado como
 * system prompt. Síncrono — os sub-agentes já vêm construídos.
 */
export function buildSupervisorAgent(input: SupervisorAgentInput): Agent {
  const instructions = [buildOrchestratorPrompt(input.ctx), input.instruction].join('\n\n');
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

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test src/features/ai-agents/mastra/build-supervisor-agent.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/ai-agents/mastra/build-supervisor-agent.ts src/features/ai-agents/mastra/build-supervisor-agent.test.ts
git commit -m "feat(ai-studio): buildSupervisorAgent (agents nativo + orchestrator prompt + workflow instruction)"
```

---

### Task 4: Enforcement de 1-default no `AiStudioRepo`

**Files:**
- Modify: `src/features/ai-studio/repo.ts:79-117` (upsert + patch)
- Test: `src/features/ai-studio/repo-default-workflow.test.ts`

**Interfaces:**
- Produces: `AiStudioRepo.patch`/`upsert` passam a, para `type==='workflow'`, garantir 1-default (via novo método privado `enforceWorkflowDefault`).

- [ ] **Step 1: Escrever o teste (falhando)**

`src/features/ai-studio/repo-default-workflow.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { AiStudioRepo } from './repo';

// Fake Firestore com doc get/set/update + where('==').get() + batch.
function makeFakeDb(initial: Record<string, any> = {}) {
  const store: Record<string, Record<string, any>> = { aiWorkflows: JSON.parse(JSON.stringify(initial)) };
  function docRef(name: string, id: string) {
    return {
      id,
      async get() { const d = store[name][id]; return { exists: d !== undefined, id, data: () => d }; },
      async set(v: any, opts?: { merge?: boolean }) { store[name][id] = opts?.merge ? { ...(store[name][id] ?? {}), ...v } : v; },
      async update(v: any) { store[name][id] = { ...store[name][id], ...v }; },
      async delete() { delete store[name][id]; },
    };
  }
  const db: any = {
    store,
    collection(name: string) {
      store[name] ??= {};
      const col: any = {
        _f: [] as Array<[string, string, unknown]>,
        doc: (id: string) => docRef(name, id),
        where(f: string, op: string, val: unknown) { const c = Object.create(col); c._f = [...col._f, [f, op, val]]; return c; },
        async get() {
          const entries = Object.entries(store[name]).filter(([, d]) => (this._f ?? []).every(([f, , val]: any) => d[f] === val));
          return { docs: entries.map(([id, d]) => ({ id, data: () => d, ref: docRef(name, id) })) };
        },
      };
      return col;
    },
    batch() {
      const ops: Array<() => void> = [];
      return {
        update(ref: any, v: any) { ops.push(() => { store.aiWorkflows[ref.id] = { ...store.aiWorkflows[ref.id], ...v }; }); },
        async commit() { ops.forEach((o) => o()); },
      };
    },
  };
  return db;
}

describe('AiStudioRepo — enforcement 1-default (workflow)', () => {
  let db: ReturnType<typeof makeFakeDb>;
  beforeEach(() => {
    db = makeFakeDb({
      default: { name: 'Default', status: 'active', isDefault: true, instruction: 'i', origin: 'system', systemKey: 'default' },
      wfb: { name: 'B', status: 'active', isDefault: false, instruction: 'i', origin: 'user' },
    });
  });

  it('patch isDefault:true em wfb desmarca o default anterior', async () => {
    const repo = new AiStudioRepo('workflow', db);
    await repo.patch('wfb', { isDefault: true });
    expect(db.store.aiWorkflows.wfb.isDefault).toBe(true);
    expect(db.store.aiWorkflows.default.isDefault).toBe(false);
  });

  it('patch isDefault:false no único default → lança', async () => {
    // torna `default` o único default (wfb já é false)
    const repo = new AiStudioRepo('workflow', db);
    await expect(repo.patch('default', { isDefault: false })).rejects.toThrow(/default/i);
  });

  it('upsert workflow com isDefault:true desmarca os outros', async () => {
    const repo = new AiStudioRepo('workflow', db);
    await repo.upsert('wfc', { name: 'C', status: 'active', isDefault: true, instruction: 'i', description: 'd' });
    expect(db.store.aiWorkflows.wfc.isDefault).toBe(true);
    expect(db.store.aiWorkflows.default.isDefault).toBe(false);
  });

  it('tipo != workflow não dispara a lógica de default', async () => {
    const skillDb = makeFakeDb();
    skillDb.store.aiSkills = { s1: { name: 'S', status: 'active', origin: 'user', playbook: 'p' } };
    const repo = new AiStudioRepo('skill', skillDb);
    await repo.patch('s1', { playbook: 'novo' }); // não deve tentar where('isDefault')
    expect(skillDb.store.aiSkills.s1.playbook).toBe('novo');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test src/features/ai-studio/repo-default-workflow.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar** — adicionar o método privado e chamá-lo em patch+upsert

Em `src/features/ai-studio/repo.ts`, adicionar o método privado (após `collectWarnings`):

```typescript
  /** Garante exatamente 1 workflow default. Só para type==='workflow'. */
  private async enforceWorkflowDefault(
    id: string,
    desired: boolean | undefined,
    existingIsDefault: boolean,
  ): Promise<void> {
    if (this.cfg.type !== 'workflow') return;
    if (desired === true) {
      const snap = await this.col().where('isDefault', '==', true).get();
      const batch = this.db.batch();
      for (const d of snap.docs) {
        if (d.id !== id) batch.update(d.ref, { isDefault: false, updatedAt: FieldValue.serverTimestamp() });
      }
      await batch.commit();
    } else if (desired === false && existingIsDefault) {
      const snap = await this.col().where('isDefault', '==', true).get();
      const others = snap.docs.filter((d) => d.id !== id);
      if (others.length === 0) {
        throw new Error('Não é possível desmarcar o único workflow default; promova outro antes.');
      }
    }
  }
```

No `upsert`, após o passo 2 (origin/locked) e antes do passo 3 (warnings) — usar `doc.isDefault` como desejado e `existing.isDefault` como estado atual:

```typescript
    // 2.b enforcement de 1-default (workflow)
    await this.enforceWorkflowDefault(
      id,
      doc.isDefault as boolean | undefined,
      existing.isDefault === true,
    );
```

No `patch`, após `assertPatchAllowed` e antes de montar `clean`:

```typescript
    await this.enforceWorkflowDefault(
      id,
      updates.isDefault as boolean | undefined,
      snap.data()!.isDefault === true,
    );
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test src/features/ai-studio/repo-default-workflow.test.ts src/features/ai-studio/repo.test.ts`
Expected: PASS (novo + repo.test.ts existente intacto — a lógica só dispara para workflow com isDefault em jogo).

- [ ] **Step 5: Commit**

```bash
git add src/features/ai-studio/repo.ts src/features/ai-studio/repo-default-workflow.test.ts
git commit -m "feat(ai-studio): enforcement exatamente-1-default em workflows (patch+upsert)"
```

---

### Task 5: Wiring no `/api/chat` + flag (atrás de `AI_STUDIO_WORKFLOWS`)

**Files:**
- Modify: `app/api/chat/route.ts:134-141` (seleção do agente)
- Modify: `src/shared/stores/app-store.ts` (flag `useAiStudioWorkflows`)
- Test: `app/api/chat/__tests__/workflow-routing.test.ts` (criar) — testa o helper de seleção isolado.

**Interfaces:**
- Consumes: `loadWorkflows` (Task 1), `selectWorkflow` (Task 2), `buildSupervisorAgent` (Task 3).
- Produces: helper `resolveChatAgent({ mastra, ctx, messages })` em `app/api/chat/resolve-chat-agent.ts` (extraído para testabilidade) + wiring na rota.

> Extrair a lógica de seleção num módulo testável (`resolve-chat-agent.ts`) mantém a rota fina e permite unit test sem montar a request HTTP inteira.

- [ ] **Step 1: Escrever o teste (falhando)**

`app/api/chat/__tests__/workflow-routing.test.ts`:

```typescript
/* @vitest-environment node */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({
  loadWorkflowsMock: vi.fn(),
  selectWorkflowMock: vi.fn(),
  buildSupervisorMock: vi.fn(),
}));
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
afterEach(() => { delete process.env.AI_STUDIO_WORKFLOWS; });

describe('lastUserText', () => {
  it('extrai o texto da última mensagem de user', () => {
    expect(lastUserText([
      { role: 'assistant', parts: [{ type: 'text', text: 'oi' }] },
      { role: 'user', parts: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] },
    ] as never)).toBe('a b');
  });
});

describe('resolveChatAgent', () => {
  it('flag off → descriptive (não-regressão)', async () => {
    const mastra = fakeMastra({ descriptive: 'DESC' });
    const agent = await resolveChatAgent({ mastra, ctx, messages });
    expect(agent).toBe('DESC');
    expect(h.loadWorkflowsMock).not.toHaveBeenCalled();
  });

  it('flag on + workflows → supervisor', async () => {
    process.env.AI_STUDIO_WORKFLOWS = 'on';
    const mastra = fakeMastra({ descriptive: 'DESC', diagnostic: 'DIAG' });
    h.loadWorkflowsMock.mockResolvedValueOnce([{ id: 'default', isDefault: true, instruction: 'WF', status: 'active' }]);
    h.selectWorkflowMock.mockResolvedValueOnce({ id: 'default', instruction: 'WF' });
    h.buildSupervisorMock.mockReturnValueOnce('SUPERVISOR');
    const agent = await resolveChatAgent({ mastra, ctx, messages });
    expect(agent).toBe('SUPERVISOR');
    const arg = h.buildSupervisorMock.mock.calls.at(-1)![0];
    expect(arg.instruction).toBe('WF');
    expect(Object.keys(arg.subAgents)).toEqual(expect.arrayContaining(['descriptive', 'diagnostic']));
  });

  it('flag on + sem workflows → descriptive', async () => {
    process.env.AI_STUDIO_WORKFLOWS = 'on';
    const mastra = fakeMastra({ descriptive: 'DESC' });
    h.loadWorkflowsMock.mockResolvedValueOnce([]);
    const agent = await resolveChatAgent({ mastra, ctx, messages });
    expect(agent).toBe('DESC');
  });

  it('flag on + erro no routing → descriptive (fail-soft)', async () => {
    process.env.AI_STUDIO_WORKFLOWS = 'on';
    const mastra = fakeMastra({ descriptive: 'DESC' });
    h.loadWorkflowsMock.mockRejectedValueOnce(new Error('firestore down'));
    const agent = await resolveChatAgent({ mastra, ctx, messages });
    expect(agent).toBe('DESC');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test app/api/chat/__tests__/workflow-routing.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar o helper**

`app/api/chat/resolve-chat-agent.ts`:

```typescript
import type { Mastra } from '@mastra/core';
import type { AgentDynamicContext } from '@/shared/config/agents/types';
import { loadWorkflows } from '@/features/ai-studio/runtime/config-loader';
import { selectWorkflow } from '@/features/ai-studio/runtime/select-workflow';
import { buildSupervisorAgent } from '@/features/ai-agents/mastra/build-supervisor-agent';

const SUB_AGENT_KEYS = [
  'descriptive', 'diagnostic', 'predictive', 'prescriptive',
  'monitoring', 'simulation', 'external', 'cashflow',
] as const;

/** Texto concatenado da última mensagem de role 'user' (UIMessage.parts). */
export function lastUserText(messages: Array<{ role: string; parts?: Array<{ type: string; text?: string }> }>): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') {
      return (messages[i].parts ?? [])
        .filter((p) => p.type === 'text' && typeof p.text === 'string')
        .map((p) => p.text)
        .join(' ');
    }
  }
  return '';
}

function collectSubAgents(mastra: Mastra): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of SUB_AGENT_KEYS) {
    try { out[key] = mastra.getAgent(key); } catch { /* fail-soft (4A) */ }
  }
  return out;
}

/**
 * Seleciona o agente que atende ao chat. Atrás de AI_STUDIO_WORKFLOWS: roteia
 * o comando a um workflow e devolve um supervisor Mastra; senão (ou em
 * qualquer falha) devolve o agente `descriptive` — comportamento atual.
 */
export async function resolveChatAgent(input: {
  mastra: Mastra;
  ctx: AgentDynamicContext;
  messages: Array<{ role: string; parts?: Array<{ type: string; text?: string }> }>;
}): Promise<unknown> {
  const descriptive = input.mastra.getAgent('descriptive');
  if (process.env.AI_STUDIO_WORKFLOWS !== 'on') return descriptive;
  try {
    const workflows = await loadWorkflows();
    if (workflows.length === 0) return descriptive;
    const command = lastUserText(input.messages);
    const wf = await selectWorkflow(command, workflows);
    const subAgents = collectSubAgents(input.mastra);
    return buildSupervisorAgent({ instruction: String(wf.instruction ?? ''), ctx: input.ctx, subAgents });
  } catch (e) {
    console.error('[chat] workflow routing falhou — usando descriptive', e);
    return descriptive;
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test app/api/chat/__tests__/workflow-routing.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire na rota**

Em `app/api/chat/route.ts`, trocar a linha `const agent = mastra.getAgent('descriptive');` (135) por:

```typescript
  const { resolveChatAgent } = await import('./resolve-chat-agent');
  const agent = (await resolveChatAgent({ mastra, ctx, messages: body.messages })) as typeof descriptiveAgentType;
```

Forma mínima e segura (evita problemas de tipo do retorno `unknown`): tipar via o próprio retorno de `getAgent`. Concretamente, substituir por:

```typescript
  const agent = (await resolveChatAgent({
    mastra,
    ctx,
    messages: body.messages,
  })) as ReturnType<typeof mastra.getAgent>;
```

O resto (`convertToModelMessages(body.messages)`, `agent.stream(...)`, a montagem do `uiMessageStream`) permanece idêntico — `agent.stream` existe tanto no descriptive quanto no supervisor (ambos são `Agent`).

- [ ] **Step 6: Flag no app-store**

Em `src/shared/stores/app-store.ts`, junto de `useAiStudioSkills`, adicionar à interface e ao store:

```typescript
  // interface
  useAiStudioWorkflows: boolean;
  setUseAiStudioWorkflows: (v: boolean) => void;
```

```typescript
  // store
  useAiStudioWorkflows: false,
  setUseAiStudioWorkflows: (v) => set({ useAiStudioWorkflows: v }),
```

- [ ] **Step 7: Build + não-regressão + suíte ampla**

Run: `pnpm build`
Expected: verde (type-check da rota + helper + supervisor).

Run: `pnpm test app/api/chat src/features/ai-studio src/features/ai-agents/mastra`
Expected: tudo PASS (incluindo o route test existente do `/api/chat`, se houver — com flag off, comportamento inalterado).

- [ ] **Step 8: Commit**

```bash
git add app/api/chat/resolve-chat-agent.ts app/api/chat/route.ts app/api/chat/__tests__/workflow-routing.test.ts src/shared/stores/app-store.ts
git commit -m "feat(ai-studio): Fase 4B — /api/chat roteia workflow→supervisor atrás de AI_STUDIO_WORKFLOWS (fail-soft)"
```

---

## Self-Review

**Spec coverage:**
- `loadWorkflows()` cacheado → Task 1. ✅
- `selectWorkflow` roteador + fallback → Task 2. ✅
- `buildSupervisorAgent` (agents nativo + compose prompt + router model) → Task 3. ✅
- Enforcement 1-default (patch+upsert) → Task 4. ✅
- Wiring `/api/chat` atrás de flag + fail-soft + lastUserText + collectSubAgents → Task 5. ✅
- Flag `useAiStudioWorkflows` (app-store) → Task 5. ✅
- Não-regressão (flag off) → Task 5 (testes + build). ✅
- Sem ADR/índice novo → conforme spec. ✅

**Placeholder scan:** Sem TBD/TODO. O Step 5 da Task 5 mostra a forma exata do cast (`as ReturnType<typeof mastra.getAgent>`), não vago.

**Type consistency:** `loadWorkflows`→`AiStudioRecord[]` (Task 1) consumido por `resolveChatAgent` (Task 5) e `selectWorkflow` (Task 2). `selectWorkflow(command, workflows)` (Task 2) e `buildSupervisorAgent({instruction, ctx, subAgents})` (Task 3) consumidos por `resolveChatAgent` (Task 5). `enforceWorkflowDefault` privado (Task 4). Nomes batem.

## Execution Notes

- Ordem: 1 → 2 → 3 → 4 → 5. (5 depende de 1/2/3; 4 é independente.)
- Tasks 1–4 são unidades testáveis isoladas; Task 5 integra + build + não-regressão.
- Flag `AI_STUDIO_WORKFLOWS` off por default → `/api/chat` idêntico ao atual.
- Habilitar em produção: `AI_STUDIO_WORKFLOWS=on` (após as outras flags, conforme desejado). Os 8 agentes (4A) passam a ser invocados pelo supervisor.
- Fecha a iniciativa AI Studio (Fases 0–4B).
