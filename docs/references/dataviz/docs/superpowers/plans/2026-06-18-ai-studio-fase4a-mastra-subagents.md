# AI Studio Fase 4A — Migração dos 7 sub-agentes para Mastra Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar os 7 sub-agentes legados (diagnostic, predictive, prescriptive, monitoring, simulation, external, cashflow) para Mastra Agent, via um helper genérico compartilhado, refatorando o descriptive para o mesmo helper e registrando os 8 no `buildMastraInstance` (fail-soft por agente).

**Architecture:** Um helper `createMastraAgentFromConfig` encapsula o wiring Fases 1/2/3 (instruções do Firestore + KB tool + capacidades de skills), parametrizado por systemKey/model/prompt-builder/tools-factory. Cada agente vira um adaptador fino. Cada agente legado ganha um `buildXAgentTools(ctx)` exportado (fatorado do `createXAgent`, que permanece para o orchestrator legado). `/api/chat` segue chamando só `descriptive`; os 7 ficam registrados mas dormentes até o 4B.

**Tech Stack:** Next.js 16, TypeScript, `@mastra/core` (Agent + Mastra), `@ai-sdk/google-vertex`, Vitest 4.

## Global Constraints

- **Helper único, sem duplicar wiring:** o wiring Fases 1/2/3 vive só em `createMastraAgentFromConfig`; os 8 agentes (descriptive + 7) o consomem. Não copiar o wiring nos adaptadores.
- **Fatoração fiel:** `buildXAgentTools(ctx)` deve devolver EXATAMENTE o mesmo objeto de tools que o `createXAgent` legado montava (incluindo as condicionais por tenancy `clientId && personaId`). NÃO alterar quais tools cada agente tem.
- **NÃO tocar:** os `createXAgent` legados além de fazê-los consumir o novo `buildXAgentTools` (o `orchestrator.ts` legado continua usando `createXAgent`); os prompt builders; os runtime helpers das Fases 1/2/3.
- **Models por agente (Vertex direto, `as never`):** `gemini-2.5-pro` para diagnostic/predictive/prescriptive/monitoring/simulation; `gemini-2.5-flash` para external/cashflow (e descriptive). `vertex('<model>')` de `@ai-sdk/google-vertex`.
- **Agent id/name/description:** `id = \`${systemKey}_agent\``; `description` e nome devem reusar a `config.description` do agente legado (lida no arquivo) para consistência com a admin/seed.
- **Fail-soft por agente:** no `buildMastraInstance`, um factory que lança é pulado + logado; os demais registram.
- **`/api/chat` inalterado:** continua `mastra.getAgent('descriptive')`. Os 7 ficam registrados mas dormentes.
- **Flags (envs existentes):** `AI_STUDIO_AGENTS`/`AI_STUDIO_KB`/`AI_STUDIO_SKILLS`. Com todas off, cada agente = `buildSystemPrompt(ctx)` + tools base, sem I/O Firestore. Sem flag nova nesta fase.
- **Sem ADR nova** (completa ADR-0014).
- **Testes:** Vitest colocalizado; `vi.hoisted`/`vi.mock`. Mastra Agent e `vertex` mockados nos testes (sem rede). `pnpm test <path>`. **Rodar `pnpm build`** na task de registro (type-check completo — lição da Fase 2).

---

## File Structure

```
src/features/ai-agents/mastra/create-mastra-agent-from-config.ts   CREATE — helper genérico
src/features/ai-agents/mastra/create-mastra-agent-from-config.test.ts CREATE
src/features/ai-agents/mastra/descriptive-agent-mastra.ts          MODIFY — delega ao helper
src/features/ai-agents/mastra/diagnostic-agent-mastra.ts           CREATE — adaptador
src/features/ai-agents/mastra/predictive-agent-mastra.ts           CREATE
src/features/ai-agents/mastra/prescriptive-agent-mastra.ts         CREATE
src/features/ai-agents/mastra/monitoring-agent-mastra.ts           CREATE
src/features/ai-agents/mastra/simulation-agent-mastra.ts           CREATE
src/features/ai-agents/mastra/external-agent-mastra.ts             CREATE
src/features/ai-agents/mastra/cashflow-agent-mastra.ts             CREATE
src/features/ai-agents/agents/{diagnostic,predictive,prescriptive,monitoring,simulation,external,cashflow}-agent.ts  MODIFY — exporta buildXAgentTools(ctx)
src/features/ai-agents/mastra/instance.ts                          MODIFY — registra os 8 (fail-soft)
```

---

### Task 1: Helper genérico `createMastraAgentFromConfig`

**Files:**
- Create: `src/features/ai-agents/mastra/create-mastra-agent-from-config.ts`
- Test: `src/features/ai-agents/mastra/create-mastra-agent-from-config.test.ts`

**Interfaces:**
- Consumes: `resolveAgentCapabilities`/`buildToolsFromKeys`/`loadAgentConfig`/`createKbRetrievalTool`/`resolveAgentInstructions` (Fases 1/2/3); `Agent` (`@mastra/core/agent`); `AgentDynamicContext`.
- Produces:
  - `interface MastraAgentFactoryInput { systemKey: string; name: string; description: string; model: unknown; buildSystemPrompt: (ctx: AgentDynamicContext) => string; buildToolsFactory: (ctx: AgentDynamicContext) => Record<string, unknown>; ctx: AgentDynamicContext }`
  - `createMastraAgentFromConfig(input): Promise<Agent>` — replica a sequência do descriptive atual (base tools → Fase 3 aditivo → Fase 2 KB → Fase 1 instruções → `new Agent`).

- [ ] **Step 1: Escrever o teste (falhando)**

`src/features/ai-agents/mastra/create-mastra-agent-from-config.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({
  resolveCapsMock: vi.fn(),
  buildFromKeysMock: vi.fn(),
  loadAgentConfigMock: vi.fn(),
  createKbToolMock: vi.fn(),
  resolveInstrMock: vi.fn(),
}));
vi.mock('@/features/ai-studio/runtime/resolve-capabilities', () => ({ resolveAgentCapabilities: h.resolveCapsMock }));
vi.mock('@/features/ai-studio/runtime/tool-registry', () => ({ buildToolsFromKeys: h.buildFromKeysMock }));
vi.mock('@/features/ai-studio/runtime/config-loader', () => ({ loadAgentConfig: h.loadAgentConfigMock }));
vi.mock('@/features/ai-studio/runtime/kb-retrieval-tool', () => ({ createKbRetrievalTool: h.createKbToolMock }));
vi.mock('@/features/ai-studio/runtime/resolve-agent', () => ({ resolveAgentInstructions: h.resolveInstrMock }));
vi.mock('@mastra/core/agent', () => ({ Agent: vi.fn(function (cfg: unknown) { return { cfg }; }) }));

import { createMastraAgentFromConfig } from './create-mastra-agent-from-config';
import { Agent } from '@mastra/core/agent';

const ctx = { clientId: 'OM', personaId: 'p', dataset: 'om', filters: {}, sessionId: 's' } as never;
const baseTools = () => ({ execute_sql: 'BASE_sql' });
const prompt = () => 'CODE_PROMPT';

function lastAgentCfg() {
  return (Agent as unknown as { mock: { calls: Array<[{ id: string; instructions: string; tools: Record<string, unknown>; model: unknown; name: string; description: string }]> } }).mock.calls.at(-1)![0];
}

function input(over: Partial<Record<string, unknown>> = {}) {
  return { systemKey: 'diagnostic', name: 'Diag', description: 'desc', model: 'MODEL', buildSystemPrompt: prompt, buildToolsFactory: baseTools, ctx, ...over } as never;
}

beforeEach(() => {
  Object.values(h).forEach((m) => m.mockReset());
  h.resolveInstrMock.mockResolvedValue('INSTR');
  h.resolveCapsMock.mockResolvedValue({ toolKeys: [], kbRefs: [] });
  h.buildFromKeysMock.mockReturnValue({});
  (Agent as unknown as { mockClear: () => void }).mockClear();
});
afterEach(() => { delete process.env.AI_STUDIO_SKILLS; delete process.env.AI_STUDIO_KB; delete process.env.AI_STUDIO_AGENTS; });

describe('createMastraAgentFromConfig', () => {
  it('flags off → instructions=fallback, tools=base, id/name/description/model corretos', async () => {
    await createMastraAgentFromConfig(input());
    expect(h.resolveCapsMock).toHaveBeenCalledWith('diagnostic', false);
    expect(h.resolveInstrMock).toHaveBeenCalledWith(expect.objectContaining({ systemKey: 'diagnostic', fallback: 'CODE_PROMPT', flagOn: false }));
    const cfg = lastAgentCfg();
    expect(cfg.id).toBe('diagnostic_agent');
    expect(cfg.name).toBe('Diag');
    expect(cfg.description).toBe('desc');
    expect(cfg.model).toBe('MODEL');
    expect(cfg.instructions).toBe('INSTR');
    expect(cfg.tools).toEqual({ execute_sql: 'BASE_sql' });
  });

  it('SKILLS on → tools concedidas aditivas sobre a base', async () => {
    process.env.AI_STUDIO_SKILLS = 'on';
    h.resolveCapsMock.mockResolvedValue({ toolKeys: ['vector_query'], kbRefs: [] });
    h.buildFromKeysMock.mockReturnValue({ vector_query: 'GRANTED' });
    await createMastraAgentFromConfig(input());
    const cfg = lastAgentCfg();
    expect(cfg.tools.execute_sql).toBe('BASE_sql');
    expect(cfg.tools.vector_query).toBe('GRANTED');
  });

  it('KB on → kb_retrieval com agent ∪ skill kbRefs', async () => {
    process.env.AI_STUDIO_KB = 'on';
    process.env.AI_STUDIO_SKILLS = 'on';
    h.loadAgentConfigMock.mockResolvedValue({ knowledgeBaseRefs: ['kb-prod'] });
    h.resolveCapsMock.mockResolvedValue({ toolKeys: [], kbRefs: ['kb-mercado', 'kb-prod'] });
    h.createKbToolMock.mockReturnValue('KB_TOOL');
    await createMastraAgentFromConfig(input());
    const arg = h.createKbToolMock.mock.calls.at(-1)![0];
    expect([...arg.knowledgeBaseRefs].sort()).toEqual(['kb-mercado', 'kb-prod']);
    expect(lastAgentCfg().tools.kb_retrieval).toBe('KB_TOOL');
  });

  it('KB on mas loadAgentConfig lança → fail-soft, sem kb_retrieval', async () => {
    process.env.AI_STUDIO_KB = 'on';
    h.loadAgentConfigMock.mockRejectedValue(new Error('firestore down'));
    await createMastraAgentFromConfig(input());
    expect(lastAgentCfg().tools.kb_retrieval).toBeUndefined();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test src/features/ai-agents/mastra/create-mastra-agent-from-config.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar o helper**

`src/features/ai-agents/mastra/create-mastra-agent-from-config.ts`:

```typescript
/**
 * Helper genérico que constrói um Mastra Agent a partir da config do AI Studio,
 * encapsulando o wiring das Fases 1 (instruções), 2 (KB retrieval) e 3
 * (capacidades de skills). Compartilhado pelos 8 sub-agentes (ADR-0014/0016).
 */
import { Agent } from '@mastra/core/agent';
import type { AgentDynamicContext } from '@/shared/config/agents/types';
import { resolveAgentInstructions } from '@/features/ai-studio/runtime/resolve-agent';
import { createKbRetrievalTool } from '@/features/ai-studio/runtime/kb-retrieval-tool';
import { loadAgentConfig } from '@/features/ai-studio/runtime/config-loader';
import { resolveAgentCapabilities } from '@/features/ai-studio/runtime/resolve-capabilities';
import { buildToolsFromKeys } from '@/features/ai-studio/runtime/tool-registry';

export interface MastraAgentFactoryInput {
  systemKey: string;
  name: string;
  description: string;
  model: unknown; // LanguageModelV2 (vertex(...)); aceito por @mastra/core via `as never`
  buildSystemPrompt: (ctx: AgentDynamicContext) => string;
  buildToolsFactory: (ctx: AgentDynamicContext) => Record<string, unknown>;
  ctx: AgentDynamicContext;
}

export async function createMastraAgentFromConfig(input: MastraAgentFactoryInput): Promise<Agent> {
  const { systemKey, name, description, model, buildSystemPrompt, buildToolsFactory, ctx } = input;

  const tools = buildToolsFactory(ctx) as Record<string, unknown>;

  // Fase 3: capacidades efetivas (tools + KBs) do agente + skills, atrás de AI_STUDIO_SKILLS.
  const caps = await resolveAgentCapabilities(systemKey, process.env.AI_STUDIO_SKILLS === 'on');
  Object.assign(tools, buildToolsFromKeys(caps.toolKeys, ctx));

  // Fase 2: KB retrieval quando AI_STUDIO_KB=on; refs = agente ∪ skills (fail-soft).
  if (process.env.AI_STUDIO_KB === 'on') {
    try {
      const cfg = await loadAgentConfig(systemKey);
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

  // Fase 1: instruções do Firestore quando AI_STUDIO_AGENTS=on; senão o builder de código.
  const instructions = await resolveAgentInstructions({
    systemKey,
    fallback: buildSystemPrompt(ctx),
    flagOn: process.env.AI_STUDIO_AGENTS === 'on',
  });

  return new Agent({
    id: `${systemKey}_agent`,
    name,
    description,
    instructions,
    model: model as never,
    tools: tools as never,
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test src/features/ai-agents/mastra/create-mastra-agent-from-config.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add src/features/ai-agents/mastra/create-mastra-agent-from-config.ts src/features/ai-agents/mastra/create-mastra-agent-from-config.test.ts
git commit -m "feat(ai-studio): helper genérico createMastraAgentFromConfig (wiring Fases 1/2/3)"
```

---

### Task 2: Refatorar `descriptive-agent-mastra` para o helper

**Files:**
- Modify: `src/features/ai-agents/mastra/descriptive-agent-mastra.ts`

**Interfaces:**
- Consumes: `createMastraAgentFromConfig` (Task 1); `buildDescriptiveAgentTools` (`../agents/descriptive-agent`); `buildDescriptiveAgentPrompt` (`@/shared/config/agents`).
- Produces: `createDescriptiveAgentMastra({ ctx })` inalterado na assinatura/comportamento, agora delegando ao helper.

- [ ] **Step 1: Confirmar a cobertura de não-regressão existente**

Run: `pnpm test src/features/ai-agents/agents/descriptive-agent.test.ts src/features/ai-agents/mastra/descriptive-agent-mastra.skills.test.ts`
Expected: PASS (baseline antes do refactor).

- [ ] **Step 2: Reescrever o arquivo delegando ao helper**

Substituir o corpo de `src/features/ai-agents/mastra/descriptive-agent-mastra.ts` por:

```typescript
/**
 * Mastra Agent — descriptive_agent (ADR-0014). Delega ao helper genérico
 * createMastraAgentFromConfig, que encapsula o wiring das Fases 1/2/3.
 */
import type { Agent } from '@mastra/core/agent';
import { vertex } from '@ai-sdk/google-vertex';
import { buildDescriptiveAgentPrompt } from '@/shared/config/agents';
import type { AgentDynamicContext } from '@/shared/config/agents/types';
import { buildDescriptiveAgentTools } from '../agents/descriptive-agent';
import { createMastraAgentFromConfig } from './create-mastra-agent-from-config';

export interface DescriptiveAgentMastraInput {
  ctx: AgentDynamicContext;
}

export async function createDescriptiveAgentMastra(input: DescriptiveAgentMastraInput): Promise<Agent> {
  return createMastraAgentFromConfig({
    systemKey: 'descriptive',
    name: 'Descriptive Agent',
    description:
      'Analisa dados da carteira: resumos, KPIs, estatísticas descritivas, curvas vintage, matrizes de transição e consultas SQL.',
    model: vertex('gemini-2.5-flash'),
    buildSystemPrompt: buildDescriptiveAgentPrompt,
    buildToolsFactory: buildDescriptiveAgentTools,
    ctx: input.ctx,
  });
}
```

> A `skills.test.ts` da Fase 3 mocka `buildDescriptiveAgentTools`, `resolveAgentCapabilities`, `buildToolsFromKeys`, `loadAgentConfig`, `createKbRetrievalTool`, `resolveAgentInstructions`, `Agent` e `vertex`. Como o helper usa exatamente esses mesmos módulos, os mocks continuam interceptando e o teste deve permanecer verde sem alteração. Se algum mock estiver no caminho antigo e quebrar, ajuste o teste para mockar os mesmos símbolos (sem mudar as asserções).

- [ ] **Step 3: Rodar não-regressão**

Run: `pnpm test src/features/ai-agents/agents/descriptive-agent.test.ts src/features/ai-agents/mastra/descriptive-agent-mastra.skills.test.ts`
Expected: PASS (comportamento idêntico via helper). Se a `skills.test.ts` precisar de ajuste de mock-path (não de asserção), faça-o.

- [ ] **Step 4: Commit**

```bash
git add src/features/ai-agents/mastra/descriptive-agent-mastra.ts src/features/ai-agents/mastra/descriptive-agent-mastra.skills.test.ts
git commit -m "refactor(ai-studio): descriptive-agent-mastra delega ao helper genérico"
```

---

### Task 3: Migrar diagnostic (template dos 7)

**Files:**
- Modify: `src/features/ai-agents/agents/diagnostic-agent.ts` (extrair `buildDiagnosticAgentTools`)
- Create: `src/features/ai-agents/mastra/diagnostic-agent-mastra.ts`
- Test: `src/features/ai-agents/mastra/diagnostic-agent-mastra.test.ts`

**Interfaces:**
- Consumes: `createMastraAgentFromConfig` (Task 1); `buildDiagnosticAgentPrompt` (`@/shared/config/agents`).
- Produces:
  - `buildDiagnosticAgentTools(ctx: AgentDynamicContext): Record<string, unknown>` (exportado de `agents/diagnostic-agent.ts`).
  - `createDiagnosticAgentMastra({ ctx }): Promise<Agent>`.

- [ ] **Step 1: Fatorar `buildDiagnosticAgentTools` do legado**

Em `src/features/ai-agents/agents/diagnostic-agent.ts`, extrair o objeto `config.tools` (linhas 26–42, hoje inline em `createDiagnosticAgent`) para uma função exportada, e fazer `createDiagnosticAgent` consumi-la. Preservar EXATAMENTE o conjunto (incl. as condicionais `clientId && personaId`):

```typescript
export function buildDiagnosticAgentTools(ctx: AgentDynamicContext): Record<string, unknown> {
  const toolCtx: ToolContext = { dataset: ctx.dataset, filters: ctx.filters, sessionId: ctx.sessionId, clientId: ctx.clientId, personaId: ctx.personaId };
  return {
    dry_run_sql: createBqDryRunSqlTool(toolCtx),
    execute_sql: createExecuteSqlTool(toolCtx),
    get_table_schema: createGetTableSchemaV2Tool(toolCtx),
    get_sample_data: createGetSampleDataTool(toolCtx),
    calculate_correlations: createCalculateCorrelationsTool(toolCtx),
    calculate_hhi: createCalculateHhiTool(toolCtx),
    decompose_variation: createDecomposeVariationTool(toolCtx),
    run_hypothesis_test: createRunHypothesisTestTool(toolCtx),
    ...(toolCtx.clientId && toolCtx.personaId
      ? {
          list_validated_queries: createBqListValidatedQueriesTool(toolCtx),
          save_validated_query: createBqSaveValidatedQueryTool(toolCtx),
        }
      : {}),
  };
}
```

E em `createDiagnosticAgent`, trocar o `tools: { ... }` inline por `tools: buildDiagnosticAgentTools(ctx)`:

```typescript
export function createDiagnosticAgent(ctx: AgentDynamicContext) {
  const config: AgentConfig = {
    id: 'diagnostic_agent',
    description: 'Diagnostica causas: correlações, concentração HHI, decomposição de variações e testes de hipótese.',
    model: 'reasoning',
    maxSteps: 6,
    inputSchema: z.object({ query: z.string() }),
    buildSystemPrompt: buildDiagnosticAgentPrompt,
    tools: buildDiagnosticAgentTools(ctx),
  };
  return createAgentTool(config, ctx);
}
```

- [ ] **Step 2: Escrever o teste do adaptador (falhando)**

`src/features/ai-agents/mastra/diagnostic-agent-mastra.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ helperMock: vi.fn(), toolsMock: vi.fn(() => ({ execute_sql: 'x' })), promptMock: vi.fn(() => 'P') }));
vi.mock('./create-mastra-agent-from-config', () => ({ createMastraAgentFromConfig: h.helperMock }));
vi.mock('../agents/diagnostic-agent', () => ({ buildDiagnosticAgentTools: h.toolsMock }));
vi.mock('@/shared/config/agents', () => ({ buildDiagnosticAgentPrompt: h.promptMock }));
vi.mock('@ai-sdk/google-vertex', () => ({ vertex: (m: string) => `vertex:${m}` }));

import { createDiagnosticAgentMastra } from './diagnostic-agent-mastra';

const ctx = { dataset: 'om', filters: {}, sessionId: 's' } as never;
beforeEach(() => { h.helperMock.mockReset().mockResolvedValue({ id: 'diagnostic_agent' }); });

describe('createDiagnosticAgentMastra', () => {
  it('chama o helper com systemKey/model/prompt/tools corretos', async () => {
    await createDiagnosticAgentMastra({ ctx });
    const arg = h.helperMock.mock.calls.at(-1)![0];
    expect(arg.systemKey).toBe('diagnostic');
    expect(arg.model).toBe('vertex:gemini-2.5-pro');
    expect(arg.buildSystemPrompt).toBe(h.promptMock);
    expect(arg.buildToolsFactory).toBe(h.toolsMock);
    expect(arg.ctx).toBe(ctx);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm test src/features/ai-agents/mastra/diagnostic-agent-mastra.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implementar o adaptador**

`src/features/ai-agents/mastra/diagnostic-agent-mastra.ts`:

```typescript
import type { Agent } from '@mastra/core/agent';
import { vertex } from '@ai-sdk/google-vertex';
import { buildDiagnosticAgentPrompt } from '@/shared/config/agents';
import type { AgentDynamicContext } from '@/shared/config/agents/types';
import { buildDiagnosticAgentTools } from '../agents/diagnostic-agent';
import { createMastraAgentFromConfig } from './create-mastra-agent-from-config';

export interface DiagnosticAgentMastraInput { ctx: AgentDynamicContext }

export async function createDiagnosticAgentMastra(input: DiagnosticAgentMastraInput): Promise<Agent> {
  return createMastraAgentFromConfig({
    systemKey: 'diagnostic',
    name: 'Diagnostic Agent',
    description: 'Diagnostica causas: correlações, concentração HHI, decomposição de variações e testes de hipótese.',
    model: vertex('gemini-2.5-pro'),
    buildSystemPrompt: buildDiagnosticAgentPrompt,
    buildToolsFactory: buildDiagnosticAgentTools,
    ctx: input.ctx,
  });
}
```

- [ ] **Step 5: Rodar e ver passar (adaptador + extração)**

Run: `pnpm test src/features/ai-agents/mastra/diagnostic-agent-mastra.test.ts src/features/ai-agents/agents/diagnostic-agent.test.ts`
Expected: PASS (adaptador + qualquer teste existente do diagnostic legado que verifique seu tool set permanece verde — a extração preserva as tools).

- [ ] **Step 6: Commit**

```bash
git add src/features/ai-agents/agents/diagnostic-agent.ts src/features/ai-agents/mastra/diagnostic-agent-mastra.ts src/features/ai-agents/mastra/diagnostic-agent-mastra.test.ts
git commit -m "feat(ai-studio): migra diagnostic para Mastra (buildDiagnosticAgentTools + adaptador)"
```

---

### Tasks 4–9: Migrar os 6 agentes restantes (mesmo padrão da Task 3)

Para CADA agente abaixo, repetir os 6 passos da Task 3 com os valores específicos do agente. O padrão é idêntico: (1) fatorar `buildXAgentTools(ctx)` extraindo o objeto `config.tools` já existente no `createXAgent` legado (preservando-o EXATAMENTE, incluindo condicionais por tenancy) e fazer `createXAgent` consumi-lo; (2–3) escrever/rodar o teste do adaptador (falhando); (4) implementar o adaptador; (5) rodar adaptador + teste legado do agente; (6) commit.

O **teste do adaptador** é o mesmo da Task 3, trocando os nomes/mocks pelo agente alvo, e asserindo `arg.systemKey`, `arg.model` (`vertex:<model>`), `arg.buildSystemPrompt`, `arg.buildToolsFactory`, `arg.ctx`.

O **adaptador** é idêntico ao da Task 3, trocando: import do prompt builder, import do `buildXAgentTools`, `systemKey`, `name`, `description` (reusar a `config.description` do legado), `model`.

**Fonte da verdade para extração:** abra `src/features/ai-agents/agents/<agente>-agent.ts`, copie o objeto `config.tools` para `buildXAgentTools`, preservando imports de factory e condicionais. NÃO adicionar/remover tools.

| Task | Agente | `systemKey` | model | prompt builder | adaptador / arquivo |
|---|---|---|---|---|---|
| 4 | predictive | `predictive` | `vertex('gemini-2.5-pro')` | `buildPredictiveAgentPrompt` | `predictive-agent-mastra.ts` |
| 5 | prescriptive | `prescriptive` | `vertex('gemini-2.5-pro')` | `buildPrescriptiveAgentPrompt` | `prescriptive-agent-mastra.ts` |
| 6 | monitoring | `monitoring` | `vertex('gemini-2.5-pro')` | `buildMonitoringAgentPrompt` | `monitoring-agent-mastra.ts` |
| 7 | simulation | `simulation` | `vertex('gemini-2.5-pro')` | `buildSimulationAgentPrompt` | `simulation-agent-mastra.ts` |
| 8 | external | `external` | `vertex('gemini-2.5-flash')` | `buildExternalAgentPrompt` | `external-agent-mastra.ts` |
| 9 | cashflow | `cashflow` | `vertex('gemini-2.5-flash')` | `buildCashflowAgentPrompt` | `cashflow-agent-mastra.ts` |

**Nomes (`name`) dos adaptadores:** `Predictive Agent`, `Prescriptive Agent`, `Monitoring Agent`, `Simulation Agent`, `External Agent`, `Cashflow Agent`.

**`buildXAgentTools` esperado por agente** (o conjunto que JÁ existe no `createXAgent` — confirmar no arquivo; pode haver tool inline e condicionais):
- **predictive** (`predictive-agent.ts`): dry_run_sql, execute_sql, forecast_timeseries, calculate_pd_lgd, build_survival_curve, generate_early_warnings, calculate_cpr_cdr, build_vintage_curves, build_transition_matrix, bqml_list_models, bqml_suggest_model, bqml_create_or_use_model, bqml_forecast, bqml_predict, bqml_detect_anomalies, schema_describe_relationships (+ quaisquer condicionais presentes no arquivo).
- **prescriptive** (`prescriptive-agent.ts`): dry_run_sql, execute_sql, run_clustering, run_causal_analysis, optimize_allocation, rank_actions, evaluate_impact.
- **monitoring** (`monitoring-agent.ts`): dry_run_sql, execute_sql, detect_anomalies, check_eligibility, check_concentration_limits, check_covenant_triggers, generate_compliance_report, bqml_list_models, bqml_forecast, bqml_detect_anomalies.
- **simulation** (`simulation-agent.ts`): dry_run_sql, execute_sql, get_baseline (tool inline — mover junto), run_sensitivity, run_scenario, run_monte_carlo, apply_stress_macro, calculate_stressed_ecl.
- **external** (`external-agent.ts`): dry_run_sql, execute_sql, search_web, get_bcb_indicator, parse_macro_data, sentiment_analysis, extract_regulatory_updates, get_market_benchmarks.
- **cashflow** (`cashflow-agent.ts`): dry_run_sql, execute_sql, calculate_wal, calculate_excess_spread, calculate_coverage_ratios, compare_cashflows, decompose_payments.

> Para `simulation`, a tool inline `get_baseline` (definida dentro de `createSimulationAgent`) deve ser movida para dentro de `buildSimulationAgentTools` para que o conjunto fique completo.

Cada task termina com seu próprio commit:
```bash
git add src/features/ai-agents/agents/<agente>-agent.ts src/features/ai-agents/mastra/<agente>-agent-mastra.ts src/features/ai-agents/mastra/<agente>-agent-mastra.test.ts
git commit -m "feat(ai-studio): migra <agente> para Mastra (build<Agente>AgentTools + adaptador)"
```

---

### Task 10: Registrar os 8 no `buildMastraInstance` (fail-soft) + build

**Files:**
- Modify: `src/features/ai-agents/mastra/instance.ts`
- Test: `src/features/ai-agents/mastra/instance.test.ts` (criar)

**Interfaces:**
- Consumes: os 8 factories `create<Agente>AgentMastra` (Tasks 2–9).
- Produces: `buildMastraInstance({ ctx })` registra os 8 agentes; um factory que lança é pulado + logado (fail-soft por agente).

- [ ] **Step 1: Escrever o teste (falhando)**

`src/features/ai-agents/mastra/instance.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  descriptive: vi.fn(), diagnostic: vi.fn(), predictive: vi.fn(), prescriptive: vi.fn(),
  monitoring: vi.fn(), simulation: vi.fn(), external: vi.fn(), cashflow: vi.fn(),
  agentsArg: undefined as unknown,
}));
vi.mock('./descriptive-agent-mastra', () => ({ createDescriptiveAgentMastra: h.descriptive }));
vi.mock('./diagnostic-agent-mastra', () => ({ createDiagnosticAgentMastra: h.diagnostic }));
vi.mock('./predictive-agent-mastra', () => ({ createPredictiveAgentMastra: h.predictive }));
vi.mock('./prescriptive-agent-mastra', () => ({ createPrescriptiveAgentMastra: h.prescriptive }));
vi.mock('./monitoring-agent-mastra', () => ({ createMonitoringAgentMastra: h.monitoring }));
vi.mock('./simulation-agent-mastra', () => ({ createSimulationAgentMastra: h.simulation }));
vi.mock('./external-agent-mastra', () => ({ createExternalAgentMastra: h.external }));
vi.mock('./cashflow-agent-mastra', () => ({ createCashflowAgentMastra: h.cashflow }));
vi.mock('@mastra/core', () => ({ Mastra: vi.fn(function (cfg: { agents: unknown }) { h.agentsArg = cfg.agents; return { cfg }; }) }));

import { buildMastraInstance } from './instance';

const ctx = { dataset: 'om', filters: {}, sessionId: 's' } as never;
beforeEach(() => {
  Object.entries(h).forEach(([k, v]) => { if (typeof v === 'function') (v as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue(`AGENT_${k}`); });
  h.agentsArg = undefined;
});

describe('buildMastraInstance', () => {
  it('registra os 8 agentes', async () => {
    await buildMastraInstance({ ctx });
    expect(Object.keys(h.agentsArg as object).sort()).toEqual(
      ['cashflow', 'descriptive', 'diagnostic', 'external', 'monitoring', 'predictive', 'prescriptive', 'simulation'],
    );
  });

  it('fail-soft: um factory que lança não impede os outros', async () => {
    h.diagnostic.mockRejectedValueOnce(new Error('boom'));
    await buildMastraInstance({ ctx });
    const agents = h.agentsArg as Record<string, unknown>;
    expect(agents.diagnostic).toBeUndefined();
    expect(agents.descriptive).toBe('AGENT_descriptive');
    expect(Object.keys(agents)).toHaveLength(7);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test src/features/ai-agents/mastra/instance.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar (fail-soft por agente)**

`src/features/ai-agents/mastra/instance.ts`:

```typescript
/**
 * Mastra runtime instance (ADR-0014). Registra os 8 sub-agentes migrados.
 * Per-request: as tools fecham sobre o contexto dinâmico (dataset, filters,
 * clientId, personaId, sessionId). Fail-soft por agente: um factory que lança
 * é pulado e logado; os demais registram (no mínimo o descriptive sobe).
 * Nota: /api/chat usa `getAgent('descriptive')`; os demais ficam registrados
 * para o supervisor (Fase 4B), dormentes até lá.
 */
import { Mastra } from '@mastra/core';
import type { Agent } from '@mastra/core/agent';
import type { AgentDynamicContext } from '@/shared/config/agents/types';
import { createDescriptiveAgentMastra } from './descriptive-agent-mastra';
import { createDiagnosticAgentMastra } from './diagnostic-agent-mastra';
import { createPredictiveAgentMastra } from './predictive-agent-mastra';
import { createPrescriptiveAgentMastra } from './prescriptive-agent-mastra';
import { createMonitoringAgentMastra } from './monitoring-agent-mastra';
import { createSimulationAgentMastra } from './simulation-agent-mastra';
import { createExternalAgentMastra } from './external-agent-mastra';
import { createCashflowAgentMastra } from './cashflow-agent-mastra';

export interface MastraInstanceContext {
  ctx: AgentDynamicContext;
}

type AgentFactory = (input: { ctx: AgentDynamicContext }) => Promise<Agent>;

const AGENT_FACTORIES: Record<string, AgentFactory> = {
  descriptive: createDescriptiveAgentMastra,
  diagnostic: createDiagnosticAgentMastra,
  predictive: createPredictiveAgentMastra,
  prescriptive: createPrescriptiveAgentMastra,
  monitoring: createMonitoringAgentMastra,
  simulation: createSimulationAgentMastra,
  external: createExternalAgentMastra,
  cashflow: createCashflowAgentMastra,
};

export async function buildMastraInstance(input: MastraInstanceContext): Promise<Mastra> {
  const agents: Record<string, Agent> = {};
  for (const [key, factory] of Object.entries(AGENT_FACTORIES)) {
    try {
      agents[key] = await factory({ ctx: input.ctx });
    } catch (e) {
      console.error(`[mastra] agente "${key}" falhou ao construir — pulado`, e);
    }
  }
  return new Mastra({ agents: agents as never });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test src/features/ai-agents/mastra/instance.test.ts`
Expected: PASS (2/2).

- [ ] **Step 5: Build + suíte ampla + não-regressão**

Run: `pnpm build`
Expected: verde (type-check completo dos 8 adaptadores + helper + instance).

Run: `pnpm test src/features/ai-agents/mastra src/features/ai-agents/agents/descriptive-agent.test.ts src/features/ai-studio`
Expected: tudo PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/ai-agents/mastra/instance.ts src/features/ai-agents/mastra/instance.test.ts
git commit -m "feat(ai-studio): buildMastraInstance registra os 8 sub-agentes (fail-soft por agente)"
```

---

## Self-Review

**Spec coverage:**
- Helper genérico `createMastraAgentFromConfig` → Task 1. ✅
- Refactor descriptive sobre o helper → Task 2 (não-regressão). ✅
- Fatorar `buildXAgentTools` dos 7 + adaptadores → Tasks 3–9. ✅
- Models por agente (pro/flash) → Tasks 3–9 (tabela). ✅
- Registrar os 8 com fail-soft por agente → Task 10. ✅
- Paridade Fases 1/2/3 via helper (flags gate) → Task 1 (testes cobrem off/on). ✅
- `/api/chat` inalterado (descriptive solo; 7 dormentes) → Task 10 (instance só registra; chat não muda). ✅
- Sem ADR/flag nova → conforme spec. ✅
- Build/tsc verde → Task 10. ✅

**Placeholder scan:** Sem TBD/TODO. Tasks 4–9 não repetem 7× o código integral porque a fonte da extração é código EXISTENTE (o `config.tools` de cada `createXAgent`), referenciado por arquivo:linha conceitual + a tabela de valores específicos + lista de tools esperadas por agente — instrução mecânica precisa, não vaga. O adaptador (uniforme) é mostrado integralmente na Task 3 e os deltas (systemKey/model/prompt/tools/name/description) estão tabelados.

**Type consistency:** `createMastraAgentFromConfig`/`MastraAgentFactoryInput` (Task 1) consumidos por todos os adaptadores (2–9). `buildXAgentTools` (3–9) consumidos pelos adaptadores e por `createXAgent` legado. `create<Agente>AgentMastra` (2–9) consumidos por `instance.ts` (10). Assinaturas batem.

## Execution Notes

- Ordem: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10. (2–9 dependem de 1; 10 depende de 2–9.)
- Tasks 4–9 são mecânicas e uniformes (transcrição + extração fiel); modelo barato serve.
- Não-regressão do `/api/chat` garantida: ele usa `getAgent('descriptive')`; registrar mais agentes não muda o que ele obtém. Com flags off, as 8 factories não fazem I/O.
- Sem operacional novo. 4B (supervisor + roteador de workflows) é o próximo sub-projeto.
