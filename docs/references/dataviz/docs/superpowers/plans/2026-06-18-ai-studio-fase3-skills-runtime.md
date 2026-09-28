# AI Studio Fase 3 — Skills no Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer os `toolRefs`/`knowledgeBaseRefs` declarados por uma skill (∪ os do agente) valerem no runtime do agente `descriptive` — tools entram no conjunto (aditivo sobre a base hardcoded, via novo registry key→factory) e KBs ampliam a visibilidade de retrieval — atrás de `AI_STUDIO_SKILLS`, com fallback fail-soft.

**Architecture:** Um novo `tool-registry` mapeia tool KEY do manifest → factory AI SDK já existente. `resolveAgentCapabilities` une os refs do agente + skills anexadas. O factory Mastra do `descriptive` injeta as tools concedidas **aditivamente** sobre a base hardcoded e passa os kbRefs efetivos (agente ∪ skills) ao KB tool. Tudo gated por flag, sem tocar a base.

**Tech Stack:** Next.js 16, TypeScript, `@mastra/core`, `ai` SDK, Vitest 4.

## Global Constraints

- **Aditivo, nunca destrutivo:** a base `buildDescriptiveAgentTools(ctx)` é o piso garantido; capacidades só ADICIONAM tools (união por key). Refs órfãs/erradas nunca removem tools.
- **Fail-soft total:** qualquer erro em capacidades/registry/leitura → base hardcoded intacta; nunca lança no caminho de criação do agente.
- **Flag server-side:** `process.env.AI_STUDIO_SKILLS === 'on'` é o SoT (mesmo padrão de `AI_STUDIO_AGENTS`/`AI_STUDIO_KB`). `useAiStudioSkills` no app-store é paridade/futuro painel.
- **Escopo:** só o agente `descriptive` (único no Mastra). Não migrar os outros 7 agentes.
- **NÃO alterar:** `buildDescriptiveAgentTools`, `resolveAgentInstructions`, e a lógica interna de `createKbRetrievalTool`/`resolveVisibleKbs` (só passamos refs diferentes).
- **Registry cobre keys do manifest com factory real.** Key sem entrada no registry / factory que devolve `null` → pulada + `console.warn` (soft).
- **Tenancy (ADR-0006):** tools server-bound (`recall_similar_sql`, `bq_list_validated_queries`, `vector_query`) só são construídas quando o `ctx` tem `clientId`(+`personaId` quando exigido); senão o factory devolve `null` e a key é pulada.
- **Tool gating (ADR-0008):** concessões ampliam o conjunto do `descriptive`; o gate por fase do supervisor continua por cima.
- **Testes:** Vitest colocalizado (`*.test.ts`); mocks via `vi.hoisted`/`vi.mock`. `pnpm test <path>`. **Rodar `pnpm build`** (type-check completo) na task de wiring — lição da Fase 2 (só `pnpm test` não pega erros de tipo).
- **Cache:** `config-loader` usa TTL de 30s (já existente); reusar.
- **Manifest keys disponíveis:** `execute_sql, bq_dry_run_sql, get_table_schema, get_sample_data, bq_list_validated_queries, recall_similar_sql, update_working_memory, retrieve_business_context, lookup_glossary, vector_query, calculate_statistics, build_vintage_curves, run_monte_carlo, bqml_forecast, bqml_detect_anomalies, generate_pdf, generate_csv, search_web, get_bcb_indicator`.

---

## File Structure

```
src/features/ai-studio/runtime/config-loader.ts          MODIFY — extrai loadSkills(); loadSkillPlaybooks deriva
src/features/ai-studio/runtime/config-loader.test.ts     CREATE — cobre loadSkills cache + loadSkillPlaybooks output
src/features/ai-studio/runtime/tool-registry.ts          CREATE — TOOL_REGISTRY + buildToolsFromKeys(keys, ctx)
src/features/ai-studio/runtime/tool-registry.test.ts     CREATE
src/features/ai-studio/runtime/resolve-capabilities.ts   CREATE — resolveAgentCapabilities(systemKey, flagOn)
src/features/ai-studio/runtime/resolve-capabilities.test.ts CREATE
src/features/ai-agents/mastra/descriptive-agent-mastra.ts MODIFY — injeta tools concedidas (aditivo) + KB refs efetivas
src/shared/stores/app-store.ts                           MODIFY — flag useAiStudioSkills (paridade)
```

---

### Task 1: config-loader — extrair `loadSkills` (DRY)

**Files:**
- Modify: `src/features/ai-studio/runtime/config-loader.ts`
- Test: `src/features/ai-studio/runtime/config-loader.test.ts` (criar)

**Interfaces:**
- Consumes: `AiStudioRepo`, `AiStudioRecord` (`../repo`).
- Produces:
  - `loadSkills(skillRefs: string[]): Promise<AiStudioRecord[]>` — devolve os docs completos das skills existentes (na ordem de `skillRefs`, pulando inexistentes), cacheado por TTL.
  - `loadSkillPlaybooks(skillRefs): Promise<string[]>` — mantém a MESMA saída de hoje (`## Skill: <name>\n<playbook>` por skill com playbook não-vazio), agora derivando de `loadSkills`.
  - `loadAgentConfig` inalterada.

- [ ] **Step 1: Escrever o teste (falhando)**

`src/features/ai-studio/runtime/config-loader.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));
vi.mock('../repo', () => ({
  AiStudioRepo: vi.fn(function () { return { get: getMock }; }),
}));

import { loadSkills, loadSkillPlaybooks } from './config-loader';

beforeEach(() => { getMock.mockReset(); });

describe('loadSkills', () => {
  it('refs vazio → [] sem buscar', async () => {
    const out = await loadSkills([]);
    expect(out).toEqual([]);
    expect(getMock).not.toHaveBeenCalled();
  });

  it('devolve docs existentes, pula inexistentes, preserva ordem', async () => {
    getMock.mockImplementation(async (id: string) =>
      id === 'safra' ? { id: 'safra', name: 'Safra', playbook: 'passo', toolRefs: ['execute_sql'], knowledgeBaseRefs: ['k1'] }
      : id === 'ltv' ? { id: 'ltv', name: 'LTV', playbook: '', toolRefs: [], knowledgeBaseRefs: ['k2'] }
      : null);
    const out = await loadSkills(['safra', 'nao-existe', 'ltv']);
    expect(out.map((s) => s.id)).toEqual(['safra', 'ltv']);
  });
});

describe('loadSkillPlaybooks (saída inalterada)', () => {
  it('formata só skills com playbook não-vazio', async () => {
    getMock.mockImplementation(async (id: string) =>
      id === 'safra' ? { id: 'safra', name: 'Safra', playbook: 'passo a passo' }
      : id === 'vazia' ? { id: 'vazia', name: 'Vazia', playbook: '   ' }
      : null);
    const out = await loadSkillPlaybooks(['safra', 'vazia']);
    expect(out).toEqual(['## Skill: Safra\npasso a passo']);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test src/features/ai-studio/runtime/config-loader.test.ts`
Expected: FAIL (`loadSkills` não existe ainda).

- [ ] **Step 3: Implementar o refactor**

Substituir, em `src/features/ai-studio/runtime/config-loader.ts`, o `skillCache` (que guardava `string | null`) por um cache de docs e reescrever `loadSkillPlaybooks` para derivar de `loadSkills`:

```typescript
import { AiStudioRepo, type AiStudioRecord } from '../repo';

// cache simples por TTL (evita ler Firestore a cada request)
const TTL_MS = 30_000;
const cache = new Map<string, { at: number; value: AiStudioRecord | null }>();
const skillDocCache = new Map<string, { at: number; value: AiStudioRecord | null }>();

/** Lê um agente de sistema pelo systemKey (== id do seed). */
export async function loadAgentConfig(systemKey: string): Promise<AiStudioRecord | null> {
  const hit = cache.get(systemKey);
  const now = Date.now();
  if (hit && now - hit.at < TTL_MS) return hit.value;
  const value = await new AiStudioRepo('agent').get(systemKey);
  cache.set(systemKey, { at: now, value });
  return value;
}

/** Carrega os docs completos das skills anexadas (existentes, na ordem), cacheado por TTL. */
export async function loadSkills(skillRefs: string[]): Promise<AiStudioRecord[]> {
  if (!skillRefs?.length) return [];
  const repo = new AiStudioRepo('skill');
  const now = Date.now();
  const out: AiStudioRecord[] = [];
  for (const ref of skillRefs) {
    const hit = skillDocCache.get(ref);
    let value: AiStudioRecord | null;
    if (hit && now - hit.at < TTL_MS) {
      value = hit.value;
    } else {
      value = await repo.get(ref);
      skillDocCache.set(ref, { at: now, value });
    }
    if (value) out.push(value);
  }
  return out;
}

/** Resolve os playbooks (texto) das skills anexadas. Deriva de loadSkills. */
export async function loadSkillPlaybooks(skillRefs: string[]): Promise<string[]> {
  const skills = await loadSkills(skillRefs);
  return skills
    .filter((s) => typeof s.playbook === 'string' && (s.playbook as string).trim())
    .map((s) => `## Skill: ${String(s.name ?? s.id)}\n${s.playbook}`);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test src/features/ai-studio/runtime/config-loader.test.ts src/features/ai-studio/runtime/resolve-agent.test.ts`
Expected: PASS (config-loader novo + resolve-agent da Fase 1 intacto).

- [ ] **Step 5: Commit**

```bash
git add src/features/ai-studio/runtime/config-loader.ts src/features/ai-studio/runtime/config-loader.test.ts
git commit -m "refactor(ai-studio): extrai loadSkills() do config-loader (DRY p/ playbooks + capacidades)"
```

---

### Task 2: tool-registry (key → factory)

**Files:**
- Create: `src/features/ai-studio/runtime/tool-registry.ts`
- Test: `src/features/ai-studio/runtime/tool-registry.test.ts`

**Interfaces:**
- Consumes: factories existentes em `src/features/ai-agents/tools/*`; `AgentDynamicContext` (`@/shared/config/agents/types`); `ToolContext` (`@/features/ai-agents/tools/tool-context`).
- Produces:
  - `type ToolFactory = (ctx: AgentDynamicContext) => unknown | null`
  - `TOOL_REGISTRY: Record<string, ToolFactory>` (keys = manifest keys com factory real)
  - `buildToolsFromKeys(keys: string[], ctx: AgentDynamicContext): Record<string, unknown>` — resolve cada key; key ausente ou factory→null é pulada + logada; retorna mapa `toolKey → tool`.

- [ ] **Step 1: Escrever o teste (falhando)**

`src/features/ai-studio/runtime/tool-registry.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

// Mocka os factories de tools p/ não tocar BigQuery/Vertex; cada um devolve um marcador.
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

import { buildToolsFromKeys, TOOL_REGISTRY } from './tool-registry';

const ctxFull = { dataset: {}, filters: {}, sessionId: 's', clientId: 'OM', personaId: 'p' } as never;
const ctxNoTenant = { dataset: {}, filters: {}, sessionId: 's' } as never;

describe('tool-registry', () => {
  it('resolve keys conhecidas em tools', () => {
    const out = buildToolsFromKeys(['execute_sql', 'lookup_glossary'], ctxFull);
    expect(out.execute_sql).toBeDefined();
    expect(out.lookup_glossary).toBeDefined();
  });

  it('pula key desconhecida sem lançar', () => {
    const out = buildToolsFromKeys(['execute_sql', 'tool-fantasma'], ctxFull);
    expect(out.execute_sql).toBeDefined();
    expect(out['tool-fantasma']).toBeUndefined();
    expect(Object.keys(out)).toHaveLength(1);
  });

  it('tenancy: vector_query/recall só quando há clientId(+persona)', () => {
    const withTenant = buildToolsFromKeys(['vector_query', 'recall_similar_sql'], ctxFull);
    expect(withTenant.vector_query).toBeDefined();
    expect(withTenant.recall_similar_sql).toBeDefined();
    const noTenant = buildToolsFromKeys(['vector_query', 'recall_similar_sql'], ctxNoTenant);
    expect(noTenant.vector_query).toBeUndefined();
    expect(noTenant.recall_similar_sql).toBeUndefined();
  });

  it('repassa ctx ao factory', () => {
    const out = buildToolsFromKeys(['execute_sql'], ctxFull) as Record<string, { c: { clientId: string } }>;
    expect(out.execute_sql.c.clientId).toBe('OM');
  });

  it('keys do registry ⊂ manifest', () => {
    // sanity: todas as keys registradas são strings não-vazias
    for (const k of Object.keys(TOOL_REGISTRY)) expect(k.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test src/features/ai-studio/runtime/tool-registry.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`src/features/ai-studio/runtime/tool-registry.ts`:

```typescript
import type { AgentDynamicContext } from '@/shared/config/agents/types';
import type { ToolContext } from '@/features/ai-agents/tools/tool-context';
import { createExecuteSqlTool } from '@/features/ai-agents/tools/execute-sql';
import { createBqDryRunSqlTool } from '@/features/ai-agents/tools/bq-dry-run-sql';
import { createGetTableSchemaV2Tool } from '@/features/ai-agents/tools/get-table-schema-v2';
import { createGetSampleDataTool } from '@/features/ai-agents/tools/get-sample-data';
import { createCalculateStatisticsTool } from '@/features/ai-agents/tools/calculate-statistics';
import { createBuildVintageCurvesTool } from '@/features/ai-agents/tools/build-vintage-curves';
import { lookupGlossaryTool } from '@/features/ai-agents/tools/lookup-glossary';
import { createVectorQueryTool } from '@/features/ai-agents/tools/vector-query';
import { createRecallSimilarSqlTool } from '@/features/ai-agents/tools/recall-similar-sql';
import { createBqListValidatedQueriesTool } from '@/features/ai-agents/tools/bq-list-validated-queries';

export type ToolFactory = (ctx: AgentDynamicContext) => unknown | null;

function toolCtxOf(ctx: AgentDynamicContext): ToolContext {
  return {
    dataset: ctx.dataset,
    filters: ctx.filters,
    sessionId: ctx.sessionId,
    clientId: ctx.clientId,
    personaId: ctx.personaId,
  };
}

/**
 * Mapa de tool KEY (do manifest) → factory AI SDK existente. Cobre as keys
 * com factory reutilizável aplicável ao agente analítico. Keys server-bound
 * (recall/list/vector) devolvem null sem tenancy (ADR-0006). Keys do manifest
 * sem entrada aqui são no-op logado em buildToolsFromKeys (não erro).
 */
export const TOOL_REGISTRY: Record<string, ToolFactory> = {
  execute_sql: (ctx) => createExecuteSqlTool(toolCtxOf(ctx)),
  bq_dry_run_sql: (ctx) => createBqDryRunSqlTool(toolCtxOf(ctx)),
  get_table_schema: (ctx) => createGetTableSchemaV2Tool(toolCtxOf(ctx)),
  get_sample_data: (ctx) => createGetSampleDataTool(toolCtxOf(ctx)),
  calculate_statistics: (ctx) => createCalculateStatisticsTool(toolCtxOf(ctx)),
  build_vintage_curves: (ctx) => createBuildVintageCurvesTool(toolCtxOf(ctx)),
  lookup_glossary: () => lookupGlossaryTool,
  vector_query: (ctx) => (ctx.clientId ? createVectorQueryTool({ clientId: ctx.clientId }) : null),
  recall_similar_sql: (ctx) =>
    ctx.clientId && ctx.personaId ? createRecallSimilarSqlTool({ clientId: ctx.clientId, personaId: ctx.personaId }) : null,
  bq_list_validated_queries: (ctx) =>
    ctx.clientId && ctx.personaId ? createBqListValidatedQueriesTool(toolCtxOf(ctx)) : null,
};

/**
 * Constrói as tools correspondentes às `keys`. Key sem entrada no registry, ou
 * factory que devolve null (ex.: server-bound sem tenancy), é pulada + logada.
 */
export function buildToolsFromKeys(
  keys: string[],
  ctx: AgentDynamicContext,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const factory = TOOL_REGISTRY[key];
    if (!factory) {
      console.warn(`[ai-studio] toolRef "${key}" sem factory no registry — pulada`);
      continue;
    }
    try {
      const built = factory(ctx);
      if (built) out[key] = built;
      else console.warn(`[ai-studio] toolRef "${key}" não construída (tenancy ausente?) — pulada`);
    } catch (e) {
      console.warn(`[ai-studio] toolRef "${key}" falhou ao construir — pulada`, e);
    }
  }
  return out;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test src/features/ai-studio/runtime/tool-registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/ai-studio/runtime/tool-registry.ts src/features/ai-studio/runtime/tool-registry.test.ts
git commit -m "feat(ai-studio): tool-registry (key→factory) + buildToolsFromKeys"
```

---

### Task 3: resolve-capabilities (união agente + skills)

**Files:**
- Create: `src/features/ai-studio/runtime/resolve-capabilities.ts`
- Test: `src/features/ai-studio/runtime/resolve-capabilities.test.ts`

**Interfaces:**
- Consumes: `loadAgentConfig`, `loadSkills` (Task 1).
- Produces:
  - `interface AgentCapabilities { toolKeys: string[]; kbRefs: string[] }`
  - `resolveAgentCapabilities(systemKey: string, flagOn: boolean): Promise<AgentCapabilities>` — flag off → `{toolKeys:[],kbRefs:[]}` sem carregar; on → união (dedup) de `agent.toolRefs`+skills.toolRefs e `agent.knowledgeBaseRefs`+skills.knowledgeBaseRefs; erro → vazio (fail-soft).

- [ ] **Step 1: Escrever o teste (falhando)**

`src/features/ai-studio/runtime/resolve-capabilities.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { loadAgentConfigMock, loadSkillsMock } = vi.hoisted(() => ({
  loadAgentConfigMock: vi.fn(), loadSkillsMock: vi.fn(),
}));
vi.mock('./config-loader', () => ({
  loadAgentConfig: loadAgentConfigMock,
  loadSkills: loadSkillsMock,
}));

import { resolveAgentCapabilities } from './resolve-capabilities';

beforeEach(() => { loadAgentConfigMock.mockReset(); loadSkillsMock.mockReset(); });

describe('resolveAgentCapabilities', () => {
  it('flag off → vazio sem carregar', async () => {
    const caps = await resolveAgentCapabilities('descriptive', false);
    expect(caps).toEqual({ toolKeys: [], kbRefs: [] });
    expect(loadAgentConfigMock).not.toHaveBeenCalled();
  });

  it('une toolRefs/kbRefs do agente + skills (dedup)', async () => {
    loadAgentConfigMock.mockResolvedValueOnce({ id: 'descriptive', toolRefs: ['execute_sql'], knowledgeBaseRefs: ['kb-prod'], skillRefs: ['safra', 'ltv'] });
    loadSkillsMock.mockResolvedValueOnce([
      { id: 'safra', toolRefs: ['vector_query', 'execute_sql'], knowledgeBaseRefs: ['kb-mercado'] },
      { id: 'ltv', toolRefs: ['recall_similar_sql'], knowledgeBaseRefs: ['kb-prod', 'kb-risco'] },
    ]);
    const caps = await resolveAgentCapabilities('descriptive', true);
    expect(caps.toolKeys.sort()).toEqual(['execute_sql', 'recall_similar_sql', 'vector_query']);
    expect(caps.kbRefs.sort()).toEqual(['kb-mercado', 'kb-prod', 'kb-risco']);
  });

  it('agente sem skills → só refs do agente', async () => {
    loadAgentConfigMock.mockResolvedValueOnce({ id: 'descriptive', toolRefs: ['execute_sql'], knowledgeBaseRefs: [], skillRefs: [] });
    loadSkillsMock.mockResolvedValueOnce([]);
    const caps = await resolveAgentCapabilities('descriptive', true);
    expect(caps.toolKeys).toEqual(['execute_sql']);
    expect(caps.kbRefs).toEqual([]);
  });

  it('doc do agente ausente → vazio', async () => {
    loadAgentConfigMock.mockResolvedValueOnce(null);
    loadSkillsMock.mockResolvedValueOnce([]);
    const caps = await resolveAgentCapabilities('descriptive', true);
    expect(caps).toEqual({ toolKeys: [], kbRefs: [] });
  });

  it('erro de leitura → vazio (fail-soft)', async () => {
    loadAgentConfigMock.mockRejectedValueOnce(new Error('firestore down'));
    const caps = await resolveAgentCapabilities('descriptive', true);
    expect(caps).toEqual({ toolKeys: [], kbRefs: [] });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test src/features/ai-studio/runtime/resolve-capabilities.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`src/features/ai-studio/runtime/resolve-capabilities.ts`:

```typescript
import { loadAgentConfig, loadSkills } from './config-loader';

export interface AgentCapabilities {
  toolKeys: string[];
  kbRefs: string[];
}

const EMPTY: AgentCapabilities = { toolKeys: [], kbRefs: [] };

/**
 * Une as capacidades declaradas pelo agente e pelas skills anexadas:
 * toolKeys = agent.toolRefs ∪ skills.toolRefs; kbRefs = agent.knowledgeBaseRefs ∪ skills.knowledgeBaseRefs.
 * flag off → vazio (sem carregar). Qualquer erro → vazio (fail-soft).
 */
export async function resolveAgentCapabilities(
  systemKey: string,
  flagOn: boolean,
): Promise<AgentCapabilities> {
  if (!flagOn) return EMPTY;
  try {
    const agent = await loadAgentConfig(systemKey);
    if (!agent) return EMPTY;
    const skills = await loadSkills((agent.skillRefs as string[] | undefined) ?? []);

    const toolKeys = new Set<string>((agent.toolRefs as string[] | undefined) ?? []);
    const kbRefs = new Set<string>((agent.knowledgeBaseRefs as string[] | undefined) ?? []);
    for (const skill of skills) {
      for (const t of (skill.toolRefs as string[] | undefined) ?? []) toolKeys.add(t);
      for (const k of (skill.knowledgeBaseRefs as string[] | undefined) ?? []) kbRefs.add(k);
    }
    return { toolKeys: Array.from(toolKeys), kbRefs: Array.from(kbRefs) };
  } catch {
    return EMPTY;
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test src/features/ai-studio/runtime/resolve-capabilities.test.ts`
Expected: PASS (5/5).

- [ ] **Step 5: Commit**

```bash
git add src/features/ai-studio/runtime/resolve-capabilities.ts src/features/ai-studio/runtime/resolve-capabilities.test.ts
git commit -m "feat(ai-studio): resolveAgentCapabilities (união toolRefs/kbRefs agente + skills)"
```

---

### Task 4: Wiring no descriptive (aditivo) + KB efetiva + store flag

**Files:**
- Modify: `src/features/ai-agents/mastra/descriptive-agent-mastra.ts`
- Modify: `src/shared/stores/app-store.ts`
- Test: `src/features/ai-agents/mastra/descriptive-agent-mastra.skills.test.ts` (criar)

**Interfaces:**
- Consumes: `resolveAgentCapabilities` (Task 3), `buildToolsFromKeys` (Task 2), `loadAgentConfig`, `createKbRetrievalTool` (Fase 2), `buildDescriptiveAgentTools`, `resolveAgentInstructions`.
- Produces: `createDescriptiveAgentMastra` agora injeta tools concedidas aditivamente e usa kbRefs efetivas; `useAiStudioSkills`/`setUseAiStudioSkills` no app-store.

- [ ] **Step 1: Escrever o teste (falhando)**

`src/features/ai-agents/mastra/descriptive-agent-mastra.skills.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({
  buildBaseMock: vi.fn(),
  resolveCapsMock: vi.fn(),
  buildFromKeysMock: vi.fn(),
  loadAgentConfigMock: vi.fn(),
  createKbToolMock: vi.fn(),
  resolveInstrMock: vi.fn(),
}));

vi.mock('../agents/descriptive-agent', () => ({ buildDescriptiveAgentTools: h.buildBaseMock }));
vi.mock('@/features/ai-studio/runtime/resolve-capabilities', () => ({ resolveAgentCapabilities: h.resolveCapsMock }));
vi.mock('@/features/ai-studio/runtime/tool-registry', () => ({ buildToolsFromKeys: h.buildFromKeysMock }));
vi.mock('@/features/ai-studio/runtime/config-loader', () => ({ loadAgentConfig: h.loadAgentConfigMock }));
vi.mock('@/features/ai-studio/runtime/kb-retrieval-tool', () => ({ createKbRetrievalTool: h.createKbToolMock }));
vi.mock('@/features/ai-studio/runtime/resolve-agent', () => ({ resolveAgentInstructions: h.resolveInstrMock }));
vi.mock('@/shared/config/agents', () => ({ buildDescriptiveAgentPrompt: () => 'PROMPT' }));
vi.mock('@mastra/core/agent', () => ({ Agent: vi.fn(function (cfg: unknown) { return { cfg }; }) }));
vi.mock('@ai-sdk/google-vertex', () => ({ vertex: () => 'model' }));

import { createDescriptiveAgentMastra } from './descriptive-agent-mastra';
import { Agent } from '@mastra/core/agent';

const ctx = { clientId: 'OM', personaId: 'p', dataset: {}, filters: {}, sessionId: 's' } as never;

function lastAgentTools() {
  const cfg = (Agent as unknown as { mock: { calls: Array<[{ tools: Record<string, unknown> }]> } }).mock.calls.at(-1)![0];
  return cfg.tools;
}

beforeEach(() => {
  Object.values(h).forEach((m) => m.mockReset());
  h.buildBaseMock.mockReturnValue({ execute_sql: 'BASE_sql', lookup_glossary: 'BASE_gloss' });
  h.resolveInstrMock.mockResolvedValue('INSTR');
  h.resolveCapsMock.mockResolvedValue({ toolKeys: [], kbRefs: [] });
  h.buildFromKeysMock.mockReturnValue({});
  (Agent as unknown as { mockClear: () => void }).mockClear();
});
afterEach(() => { delete process.env.AI_STUDIO_SKILLS; delete process.env.AI_STUDIO_KB; });

describe('descriptive Mastra — Fase 3 skills wiring', () => {
  it('AI_STUDIO_SKILLS off → tools = só base (não-regressão)', async () => {
    await createDescriptiveAgentMastra({ ctx });
    expect(h.resolveCapsMock).toHaveBeenCalledWith('descriptive', false);
    expect(lastAgentTools()).toEqual({ execute_sql: 'BASE_sql', lookup_glossary: 'BASE_gloss' });
  });

  it('AI_STUDIO_SKILLS on → base + tools concedidas (aditivo)', async () => {
    process.env.AI_STUDIO_SKILLS = 'on';
    h.resolveCapsMock.mockResolvedValue({ toolKeys: ['vector_query'], kbRefs: [] });
    h.buildFromKeysMock.mockReturnValue({ vector_query: 'GRANTED_vector' });
    await createDescriptiveAgentMastra({ ctx });
    const tools = lastAgentTools();
    expect(tools.execute_sql).toBe('BASE_sql');       // base preservada
    expect(tools.vector_query).toBe('GRANTED_vector'); // concedida
  });

  it('KB on + SKILLS on → kb tool recebe agent.kbRefs ∪ skill.kbRefs', async () => {
    process.env.AI_STUDIO_KB = 'on';
    process.env.AI_STUDIO_SKILLS = 'on';
    h.loadAgentConfigMock.mockResolvedValue({ knowledgeBaseRefs: ['kb-prod'] });
    h.resolveCapsMock.mockResolvedValue({ toolKeys: [], kbRefs: ['kb-mercado', 'kb-prod'] });
    h.createKbToolMock.mockReturnValue('KB_TOOL');
    await createDescriptiveAgentMastra({ ctx });
    const arg = h.createKbToolMock.mock.calls.at(-1)![0];
    expect([...arg.knowledgeBaseRefs].sort()).toEqual(['kb-mercado', 'kb-prod']);
    expect(lastAgentTools().kb_retrieval).toBe('KB_TOOL');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test src/features/ai-agents/mastra/descriptive-agent-mastra.skills.test.ts`
Expected: FAIL.

- [ ] **Step 3: Modificar `descriptive-agent-mastra.ts`**

Adicionar imports no topo:

```typescript
import { resolveAgentCapabilities } from '@/features/ai-studio/runtime/resolve-capabilities';
import { buildToolsFromKeys } from '@/features/ai-studio/runtime/tool-registry';
```

Substituir o corpo entre `const tools = buildDescriptiveAgentTools(ctx) ...` e o `const fallback = ...` por:

```typescript
  const tools = buildDescriptiveAgentTools(ctx) as Record<string, unknown>;

  // Fase 3: capacidades efetivas (tools + KBs) do agente + skills anexadas,
  // atrás de AI_STUDIO_SKILLS. Aditivo sobre a base; fail-soft (resolve* já
  // devolve vazio em erro/flag-off, então buildToolsFromKeys([]) é no-op).
  const caps = await resolveAgentCapabilities(
    'descriptive',
    process.env.AI_STUDIO_SKILLS === 'on',
  );
  Object.assign(tools, buildToolsFromKeys(caps.toolKeys, ctx));

  // Fase 2: tool de retrieval KB-scoped quando AI_STUDIO_KB=on. Refs efetivas =
  // knowledgeBaseRefs do agente ∪ kbRefs das skills (caps.kbRefs já as une
  // quando SKILLS on; vazio caso contrário → comportamento Fase 2 inalterado).
  if (process.env.AI_STUDIO_KB === 'on') {
    try {
      const cfg = await loadAgentConfig('descriptive');
      const agentRefs = (cfg?.knowledgeBaseRefs as string[] | undefined) ?? [];
      const kbRefs = Array.from(new Set([...agentRefs, ...caps.kbRefs]));
      if (kbRefs.length > 0) {
        tools.kb_retrieval = createKbRetrievalTool({
          clientId: (ctx as { clientId?: string }).clientId,
          knowledgeBaseRefs: kbRefs,
        });
      }
    } catch {
      // fail-soft: sem KB tool, segue com as tools (base + concedidas)
    }
  }
```

> O restante (`fallback`/`resolveAgentInstructions`/`new Agent(...)`) permanece idêntico.

- [ ] **Step 4: Modificar `app-store.ts` (flag de paridade)**

Junto de `useAiStudioKb` (Fase 2), adicionar à interface e ao store:

```typescript
  // interface (junto de useAiStudioKb)
  useAiStudioSkills: boolean;
  setUseAiStudioSkills: (v: boolean) => void;
```

```typescript
  // store (junto de useAiStudioKb)
  useAiStudioSkills: false,
  setUseAiStudioSkills: (v) => set({ useAiStudioSkills: v }),
```

- [ ] **Step 5: Rodar e ver passar + não-regressão**

Run: `pnpm test src/features/ai-agents/mastra/descriptive-agent-mastra.skills.test.ts src/features/ai-agents/agents/descriptive-agent.test.ts`
Expected: PASS (skills wiring 3/3 + descriptive não-regressão verde).

- [ ] **Step 6: Build (type-check completo)**

Run: `pnpm build`
Expected: verde.

- [ ] **Step 7: Suíte ampla AI Studio + não-regressão**

Run: `pnpm test src/features/ai-studio src/features/ai-agents/mastra src/features/ai-agents/agents/descriptive-agent.test.ts`
Expected: tudo PASS.

- [ ] **Step 8: Commit**

```bash
git add src/features/ai-agents/mastra/descriptive-agent-mastra.ts src/shared/stores/app-store.ts src/features/ai-agents/mastra/descriptive-agent-mastra.skills.test.ts
git commit -m "feat(ai-studio): Fase 3 — skills concedem tools/KBs ao descriptive atrás de AI_STUDIO_SKILLS (aditivo)"
```

---

## Self-Review

**Spec coverage:**
- Skill toolRefs/kbRefs passam a valer → Tasks 2, 3, 4. ✅
- Tool registry key→factory (enabler) → Task 2. ✅
- Aditivo sobre base hardcoded → Task 4 (Object.assign sobre `buildDescriptiveAgentTools`). ✅
- KB visibility = agente ∪ skills → Task 4. ✅
- Refactor DRY loadSkills → Task 1. ✅
- Flag `AI_STUDIO_SKILLS` + store `useAiStudioSkills` → Task 4. ✅
- Fail-soft total → Tasks 3 (catch→empty), 2 (skip+warn), 4 (KB try/catch). ✅
- Tenancy server-bound tools → Task 2 (null sem clientId/personaId). ✅
- Não-regressão (flags off) → Task 4 (steps 5,7). ✅
- Sem ADR nova (implementa ADR-0016) — conforme spec. ✅

**Placeholder scan:** Sem TBD/TODO. Registry cobre keys com factory confirmado (execute_sql, bq_dry_run_sql, get_table_schema, get_sample_data, calculate_statistics, build_vintage_curves, lookup_glossary, vector_query, recall_similar_sql, bq_list_validated_queries); expandir é follow-up aditivo (cada key nova exige import do factory).

**Type consistency:** `loadSkills` (Task 1) consumido por `resolveAgentCapabilities` (Task 3). `AgentCapabilities.toolKeys/kbRefs` (Task 3) consumidos por `buildToolsFromKeys` (Task 2) e wiring (Task 4). `ToolFactory`/`buildToolsFromKeys` (Task 2) usados na Task 4. `toolCtxOf` espelha o `ToolContext` de `buildDescriptiveAgentTools`. Nomes batem.

## Execution Notes

- Ordem: 1 → 2 → 3 → 4. (3 depende de 1; 4 depende de 2+3.)
- Todas TDD; Task 4 adiciona build + não-regressão.
- Flag `AI_STUDIO_SKILLS` off por default → nenhuma capacidade adicionada; `descriptive` idêntico ao atual.
- Sem operacional novo (sem migração/seed/índice). Habilitar = setar `AI_STUDIO_SKILLS=on` após as outras flags conforme desejado.
