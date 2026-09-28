# AI Studio — Foundation (Fase 0 + início Fase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar a configuração da IA (Agents, Skills, Knowledge Bases, Workflows) gerenciável como CRUD na admin do DataViz, persistida no Firestore, com proteção sistema/usuário — e ligar o primeiro agente (descriptive) para ler essa config em runtime atrás de feature flag, com fallback ao código.

**Architecture:** Quatro entidades compartilham um **envelope comum** e um **núcleo genérico DRY** (`AiStudioRepo` + `route-factory` + `entity-config` registry), parametrizado por entidade. As tools continuam em código (catálogo read-only via manifest). Proteção (`origin: system|user` + campos travados + reset) vive em política de código. Integração runtime é **live, faseada, atrás de flag**, com fallback aos builders de prompt existentes (zero regressão).

**Tech Stack:** Next.js 16 (App Router), TypeScript, Zod 4, Firestore (`firebase-admin`), Mastra (`@mastra/core`), Vitest 4, shadcn/ui, sonner (toasts), Zustand (flags).

## Global Constraints

- **Package manager:** pnpm (v10.32.1). Nunca npm/yarn.
- **Storage:** Firestore via `getDb()` de `@/shared/lib/firebase/admin`. Sem Postgres (ADR-0013). BigQuery só para dados de cliente.
- **Doc id:** slug kebab-case (`/^[a-z][a-z0-9-]*$/`), validado por `Slug` de `@/shared/schemas/identifier`.
- **Timestamps:** sempre `FieldValue.serverTimestamp()`; só setar `createdAt` quando o doc não existe.
- **Refs de catálogo:** **soft + warning** (refs órfãs viram aviso no 200, nunca bloqueiam). Só dados (`resolveColumn`) é fail-loud — não se aplica aqui.
- **Auth admin:** toda rota `/api/ai-studio/*` usa `requireAdmin(req)` + `isAdminAuthOk` de `@/shared/lib/auth/require-admin`. Rotas com `firebase-admin` declaram `export const runtime = 'nodejs'`.
- **Proteção:** `origin === 'system'` ⇒ DELETE bloqueado (422); PATCH/upsert que toque campo travado ⇒ 422. `origin === 'user'` ⇒ livre. Admin nunca cria `origin: 'system'`.
- **Model tiers válidos:** `'router' | 'fast' | 'slow' | 'reasoning'` (chaves do model-registry).
- **Testes:** Vitest. Testes de rota usam `/* @vitest-environment node */` + `vi.hoisted`/`vi.mock`. Rodar com `pnpm test <path>`.
- **Tabela de campos travados (system):**

  | Entidade | Travado | Editável |
  |---|---|---|
  | agent | `id`, `systemKey`, `kind` | `instructions`, `description`, `model`, `skillRefs`, `toolRefs`, `knowledgeBaseRefs`, `status` |
  | skill | `id`, `systemKey` | `playbook`, `description`, `toolRefs`, `knowledgeBaseRefs`, `status` |
  | workflow | `id`, `systemKey` | `instruction`, `description`, `isDefault`, `status` |
  | knowledgeBase | `id`, `systemKey`, `clientId` | `name`, `description`, `status` |

- **Desvio do spec (registrado):** reset é `POST {action:'reset', id}` na mesma rota (padrão `action:'duplicate'` existente), não subrota `:reset`.

---

## File Structure

**Schemas** (`src/shared/schemas/ai-studio/`):
- `common.ts` — `AiStatus`, `AiOrigin`, `AiEnvelopeBase`, tipos.
- `agent.ts`, `skill.ts`, `workflow.ts`, `knowledge-base.ts`, `knowledge-base-doc.ts` — schemas por entidade.

**Núcleo** (`src/features/ai-studio/`):
- `tools-manifest.ts` — `ToolDescriptor[]` + `hasTool`/`listTools`.
- `protection.ts` — política de campos travados + `assertDeletable`/`assertPatchAllowed`/`stripLocked`.
- `entity-config.ts` — `AiEntityType`, `EntityConfig`, registry `ENTITY_CONFIGS`.
- `repo.ts` — `AiStudioRepo` genérico (DI de `Firestore`).
- `seed/manifest.ts` — seeds de sistema.
- `seed/ensure-seed.ts` — seeder idempotente.
- `runtime/config-loader.ts` — leitura cacheada (Fase 1).
- `runtime/resolve-agent.ts` — composição da instrução (Fase 1).

**Núcleo admin (client)** (`src/features/ai-studio/admin/`):
- `model/api.ts` — wrappers fetch (client) por entidade.
- `model/useAiStudioCrud.ts` — hook genérico.
- `ui/AiStudioTab.tsx`, `ui/AiStudioTable.tsx` — lista genérica.
- `ui/AgentForm.tsx`, `ui/SkillForm.tsx`, `ui/WorkflowForm.tsx`, `ui/KnowledgeBaseForm.tsx` — forms.
- `ui/ToolsCatalog.tsx` — catálogo read-only.

**API** (`app/api/ai-studio/`):
- `route-factory.ts` — handlers genéricos.
- `agents/route.ts`, `skills/route.ts`, `workflows/route.ts`, `kb/route.ts`, `tools/route.ts`.

**Admin wiring:**
- `src/features/admin/model/admin-nav.ts` (modificar), `src/features/admin/ui/AdminPage.tsx` (modificar).

**Runtime wiring (Fase 1):**
- `src/shared/stores/app-store.ts` (modificar — flag), factory Mastra do descriptive (modificar).

**ADR:** `adrs/decisions/0016-ai-studio-config-data-driven.md`.

**Scripts:** `scripts/seed-ai-studio.ts`.

---

### Task 1: ADR-0016 (decisão arquitetural)

**Files:**
- Create: `adrs/decisions/0016-ai-studio-config-data-driven.md`

ADR é documento; sem ciclo de teste. Seguir formato Nygard PT-BR das ADRs existentes.

- [ ] **Step 1: Escrever a ADR**

Conteúdo (ajustar números de seção ao template do repo se divergir):

```markdown
# 16. AI Studio — Configuração de IA data-driven (Agents/Skills/Workflows/KB)

Date: 2026-06-17
Status: Accepted
Supersedes: —
Extends: ADR-0014 (Mastra runtime full)
Relacionado: ADR-0013 (Firestore), ADR-0003 (state-machine Canvas — inalterada), ADR-0006 (multi-tenancy), ADR-0008 (tool gating), ADR-0011 (semantic recall)

## Context

Instruções de agentes, "skills" e orquestração vivem em código (`src/shared/config/agents/*`,
`src/features/ai-agents/agents/*`). Ajustar comportamento exige PR+deploy. O produto precisa de
uma camada de gestão (CRUD na admin) que valha em runtime, sem deploy.

## Decision

Introduzir o **AI Studio**: Agents, Skills e Workflows passam a ser configuração **data-driven**
no Firestore (coleções `aiAgents`, `aiSkills`, `aiWorkflows`), globais à org. Knowledge Bases
(`knowledgeBases` + `knowledgeBaseDocs`) organizam documentos para RAG escopado, podendo ser
globais ou por `clientId`. Tools permanecem em **código** (catálogo read-only).

- **Tudo é instrução que dirige o runtime LLM** (coerente com Mastra/ADR-0014).
- **Workflow** = instrução em prosa interpretada pelo supervisor; selecionado por descrição +
  agente roteador, com 1 workflow default de fallback.
- **Proteção:** `origin: system|user`; registros de sistema não são deletáveis e têm campos
  estruturais travados (política em código), com ação "restaurar padrão" (re-seed).
- **Integração runtime live e faseada**, atrás de feature flags, com **fallback** aos builders
  de prompt em código (zero regressão).
- A state-machine determinística do Canvas (ADR-0003) **não é alterada**; coexiste.

## Consequences

- (+) Gestão de IA sem deploy; superfície de admin uniforme; rollback por flag.
- (+) Reaproveita RAG/embeddings, multi-tenancy e tool gating existentes.
- (−) Config de runtime agora depende de leitura do Firestore (mitigado por cache + fallback).
- (−) Builders de prompt passam a ter papel duplo (fonte de tipos/seed/fallback) até consolidação.
```

- [ ] **Step 2: Commit**

```bash
git add adrs/decisions/0016-ai-studio-config-data-driven.md
git commit -m "docs(adr): ADR-0016 AI Studio — config data-driven (estende ADR-0014)"
```

---

### Task 2: Schemas (envelope comum + 4 entidades + kb doc)

**Files:**
- Create: `src/shared/schemas/ai-studio/common.ts`
- Create: `src/shared/schemas/ai-studio/agent.ts`
- Create: `src/shared/schemas/ai-studio/skill.ts`
- Create: `src/shared/schemas/ai-studio/workflow.ts`
- Create: `src/shared/schemas/ai-studio/knowledge-base.ts`
- Create: `src/shared/schemas/ai-studio/knowledge-base-doc.ts`
- Test: `src/shared/schemas/ai-studio/schemas.test.ts`

**Interfaces:**
- Produces: `AiStatus`, `AiOrigin`, `AiEnvelopeBase` (common); `AiAgentDoc`/`ModelTier`/`AgentKind` (agent); `AiSkillDoc` (skill); `AiWorkflowDoc` (workflow); `KnowledgeBaseDoc` (knowledge-base); `KnowledgeBaseSourceDoc`/`KbDocStatus` (knowledge-base-doc). Todos os `*Doc` são schemas SEM `id` (id validado por `Slug` na rota), espelhando `DashboardTemplateDoc`.

- [ ] **Step 1: Escrever os testes (falhando)**

`src/shared/schemas/ai-studio/schemas.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { AiEnvelopeBase, AiOrigin, AiStatus } from './common';
import { AiAgentDoc } from './agent';
import { AiSkillDoc } from './skill';
import { AiWorkflowDoc } from './workflow';
import { KnowledgeBaseDoc } from './knowledge-base';
import { KnowledgeBaseSourceDoc } from './knowledge-base-doc';

describe('AiEnvelopeBase', () => {
  it('aplica defaults de status/origin', () => {
    const parsed = AiEnvelopeBase.parse({ name: 'X' });
    expect(parsed.status).toBe('active');
    expect(parsed.origin).toBe('user');
    expect(parsed.description).toBe('');
  });
  it('rejeita name vazio', () => {
    expect(AiEnvelopeBase.safeParse({ name: '' }).success).toBe(false);
  });
});

describe('AiAgentDoc', () => {
  it('default model=fast, kind=worker, refs vazios', () => {
    const a = AiAgentDoc.parse({ name: 'Descriptive' });
    expect(a.model).toBe('fast');
    expect(a.kind).toBe('worker');
    expect(a.skillRefs).toEqual([]);
    expect(a.toolRefs).toEqual([]);
    expect(a.knowledgeBaseRefs).toEqual([]);
  });
  it('rejeita model inválido', () => {
    expect(AiAgentDoc.safeParse({ name: 'X', model: 'gpt' }).success).toBe(false);
  });
});

describe('AiSkillDoc', () => {
  it('default playbook vazio + refs', () => {
    const s = AiSkillDoc.parse({ name: 'Safra' });
    expect(s.playbook).toBe('');
    expect(s.toolRefs).toEqual([]);
  });
});

describe('AiWorkflowDoc', () => {
  it('default isDefault=false', () => {
    const w = AiWorkflowDoc.parse({ name: 'Default' });
    expect(w.isDefault).toBe(false);
    expect(w.instruction).toBe('');
  });
});

describe('KnowledgeBaseDoc', () => {
  it('clientId default null + embeddingModel + contadores 0', () => {
    const k = KnowledgeBaseDoc.parse({ name: 'Mercado SBPE' });
    expect(k.clientId).toBeNull();
    expect(k.embeddingModel).toBe('gemini-embedding-001');
    expect(k.docCount).toBe(0);
  });
});

describe('KnowledgeBaseSourceDoc', () => {
  it('status default pending', () => {
    const d = KnowledgeBaseSourceDoc.parse({
      knowledgeBaseId: 'mercado-sbpe', filename: 'a.md', mimeType: 'text/markdown', sizeBytes: 10,
    });
    expect(d.status).toBe('pending');
    expect(d.chunkCount).toBe(0);
  });
});

it('enums expõem valores esperados', () => {
  expect(AiStatus.options).toEqual(['active', 'draft', 'archived']);
  expect(AiOrigin.options).toEqual(['system', 'user']);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test src/shared/schemas/ai-studio/schemas.test.ts`
Expected: FAIL (módulos não existem).

- [ ] **Step 3: Implementar os schemas**

`src/shared/schemas/ai-studio/common.ts`:

```typescript
import { z } from 'zod';

export const AiStatus = z.enum(['active', 'draft', 'archived']);
export const AiOrigin = z.enum(['system', 'user']);

/** Campos comuns a todas as 4 entidades do AI Studio (sem `id`). */
export const AiEnvelopeBase = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).default(''),
  status: AiStatus.default('active'),
  origin: AiOrigin.default('user'),
  systemKey: z.string().optional(),
});

export type AiStatus = z.infer<typeof AiStatus>;
export type AiOrigin = z.infer<typeof AiOrigin>;
export type AiEnvelopeBase = z.infer<typeof AiEnvelopeBase>;
```

`src/shared/schemas/ai-studio/agent.ts`:

```typescript
import { z } from 'zod';
import { AiEnvelopeBase } from './common';
import { Slug } from '../identifier';

export const ModelTier = z.enum(['router', 'fast', 'slow', 'reasoning']);
export const AgentKind = z.enum(['worker', 'orchestrator']);

export const AiAgentDoc = AiEnvelopeBase.extend({
  kind: AgentKind.default('worker'),
  instructions: z.string().max(20000).default(''),
  model: ModelTier.default('fast'),
  skillRefs: z.array(Slug).default([]),
  toolRefs: z.array(z.string()).default([]),
  knowledgeBaseRefs: z.array(Slug).default([]),
});

export type ModelTier = z.infer<typeof ModelTier>;
export type AgentKind = z.infer<typeof AgentKind>;
export type AiAgentDoc = z.infer<typeof AiAgentDoc>;
```

`src/shared/schemas/ai-studio/skill.ts`:

```typescript
import { z } from 'zod';
import { AiEnvelopeBase } from './common';
import { Slug } from '../identifier';

export const AiSkillDoc = AiEnvelopeBase.extend({
  playbook: z.string().max(20000).default(''),
  toolRefs: z.array(z.string()).default([]),
  knowledgeBaseRefs: z.array(Slug).default([]),
});

export type AiSkillDoc = z.infer<typeof AiSkillDoc>;
```

`src/shared/schemas/ai-studio/workflow.ts`:

```typescript
import { z } from 'zod';
import { AiEnvelopeBase } from './common';

export const AiWorkflowDoc = AiEnvelopeBase.extend({
  instruction: z.string().max(20000).default(''),
  isDefault: z.boolean().default(false),
});

export type AiWorkflowDoc = z.infer<typeof AiWorkflowDoc>;
```

`src/shared/schemas/ai-studio/knowledge-base.ts`:

```typescript
import { z } from 'zod';
import { AiEnvelopeBase } from './common';

export const KnowledgeBaseDoc = AiEnvelopeBase.extend({
  clientId: z.string().nullable().default(null),
  embeddingModel: z.string().default('gemini-embedding-001'),
  docCount: z.number().int().nonnegative().default(0),
  chunkCount: z.number().int().nonnegative().default(0),
});

export type KnowledgeBaseDoc = z.infer<typeof KnowledgeBaseDoc>;
```

`src/shared/schemas/ai-studio/knowledge-base-doc.ts`:

```typescript
import { z } from 'zod';
import { Slug } from '../identifier';

export const KbDocStatus = z.enum(['pending', 'processing', 'ready', 'error']);

export const KnowledgeBaseSourceDoc = z.object({
  knowledgeBaseId: Slug,
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  status: KbDocStatus.default('pending'),
  chunkCount: z.number().int().nonnegative().default(0),
  error: z.string().optional(),
  uploadedBy: z.string().optional(),
});

export type KbDocStatus = z.infer<typeof KbDocStatus>;
export type KnowledgeBaseSourceDoc = z.infer<typeof KnowledgeBaseSourceDoc>;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test src/shared/schemas/ai-studio/schemas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/schemas/ai-studio
git commit -m "feat(ai-studio): schemas Zod (envelope + agent/skill/workflow/kb)"
```

---

### Task 3: Tools manifest (catálogo read-only)

**Files:**
- Create: `src/features/ai-studio/tools-manifest.ts`
- Test: `src/features/ai-studio/tools-manifest.test.ts`

**Interfaces:**
- Produces: `ToolDescriptor { key: string; name: string; description: string; category: ToolCategory }`, `TOOL_MANIFEST: ToolDescriptor[]`, `hasTool(key: string): boolean`, `listTools(): ToolDescriptor[]`.

- [ ] **Step 1: Teste (falhando)**

`src/features/ai-studio/tools-manifest.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { TOOL_MANIFEST, hasTool, listTools } from './tools-manifest';

describe('tools-manifest', () => {
  it('expõe tools reais do runtime', () => {
    expect(hasTool('execute_sql')).toBe(true);
    expect(hasTool('vector_query')).toBe(true);
    expect(hasTool('tool-que-nao-existe')).toBe(false);
  });
  it('todas as entradas têm key/name/description/category', () => {
    for (const t of listTools()) {
      expect(t.key).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.category).toBeTruthy();
    }
  });
  it('keys são únicas', () => {
    const keys = TOOL_MANIFEST.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test src/features/ai-studio/tools-manifest.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar o manifest**

`src/features/ai-studio/tools-manifest.ts` (lista curada das tools de `src/features/ai-agents/tools/`; expandir conforme necessário):

```typescript
export type ToolCategory =
  | 'data' | 'stats' | 'bqml' | 'canvas' | 'export' | 'memory' | 'rag' | 'external';

export interface ToolDescriptor {
  key: string;
  name: string;
  description: string;
  category: ToolCategory;
}

export const TOOL_MANIFEST: ToolDescriptor[] = [
  { key: 'execute_sql', name: 'Executar SQL', description: 'Roda uma query no BigQuery do cliente.', category: 'data' },
  { key: 'bq_dry_run_sql', name: 'Validar SQL (dry-run)', description: 'Valida SQL sem executar.', category: 'data' },
  { key: 'get_table_schema', name: 'Schema da tabela', description: 'Introspecção de schema.', category: 'data' },
  { key: 'get_sample_data', name: 'Amostra de dados', description: 'Retorna linhas de amostra.', category: 'data' },
  { key: 'bq_list_validated_queries', name: 'Catálogo de SQL', description: 'Lista queries curadas (ADR-0009).', category: 'data' },
  { key: 'recall_similar_sql', name: 'Recall de SQL', description: 'Busca semântica de SQL similar (ADR-0011).', category: 'memory' },
  { key: 'update_working_memory', name: 'Memória de trabalho', description: 'Persiste memória da sessão.', category: 'memory' },
  { key: 'retrieve_business_context', name: 'Contexto de negócio', description: 'Contexto específico do cliente.', category: 'memory' },
  { key: 'lookup_glossary', name: 'Glossário', description: 'Consulta termos do glossário.', category: 'memory' },
  { key: 'vector_query', name: 'Busca RAG', description: 'Recupera documentos por similaridade.', category: 'rag' },
  { key: 'calculate_statistics', name: 'Estatísticas', description: 'Agregações estatísticas.', category: 'stats' },
  { key: 'build_vintage_curves', name: 'Curvas de safra', description: 'Curvas de vintage de crédito.', category: 'stats' },
  { key: 'run_monte_carlo', name: 'Monte Carlo', description: 'Simulação de Monte Carlo.', category: 'stats' },
  { key: 'bqml_forecast', name: 'BQML Forecast', description: 'Previsão via BigQuery ML.', category: 'bqml' },
  { key: 'bqml_detect_anomalies', name: 'BQML Anomalias', description: 'Detecção de anomalias.', category: 'bqml' },
  { key: 'generate_pdf', name: 'Gerar PDF', description: 'Exporta relatório em PDF.', category: 'export' },
  { key: 'generate_csv', name: 'Gerar CSV', description: 'Exporta dados em CSV.', category: 'export' },
  { key: 'search_web', name: 'Busca web', description: 'Busca dados externos.', category: 'external' },
  { key: 'get_bcb_indicator', name: 'Indicador BCB', description: 'Indicadores econômicos do Banco Central.', category: 'external' },
];

const KEYS = new Set(TOOL_MANIFEST.map((t) => t.key));
export function hasTool(key: string): boolean { return KEYS.has(key); }
export function listTools(): ToolDescriptor[] { return TOOL_MANIFEST; }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test src/features/ai-studio/tools-manifest.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/ai-studio/tools-manifest.ts src/features/ai-studio/tools-manifest.test.ts
git commit -m "feat(ai-studio): tool manifest read-only para os seletores"
```

---

### Task 4: Política de proteção (sistema vs usuário)

**Files:**
- Create: `src/features/ai-studio/protection.ts`
- Test: `src/features/ai-studio/protection.test.ts`

**Interfaces:**
- Consumes: `AiEntityType` (será criado na Task 5; para evitar dependência circular, declare o union localmente aqui como `type AiEntityType = 'agent' | 'skill' | 'workflow' | 'knowledgeBase'` e reexporte de `entity-config.ts`).
- Produces:
  - `LOCKED_FIELDS: Record<AiEntityType, string[]>`
  - `isLockedField(type: AiEntityType, field: string): boolean`
  - `assertDeletable(origin: 'system' | 'user'): void` — lança `ProtectionError` se system.
  - `assertPatchAllowed(type, origin, updates: Record<string, unknown>): void` — lança se algum campo travado vier em `updates` e `origin==='system'`.
  - `stripLockedOnUpsert(type, existingOrigin, incoming, existing): Record<string, unknown>` — em upsert de doc system existente, descarta campos travados do `incoming` (preserva os do `existing`); em doc user, passa direto.
  - `class ProtectionError extends Error { status = 422 }`

- [ ] **Step 1: Teste (falhando)**

`src/features/ai-studio/protection.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  LOCKED_FIELDS, isLockedField, assertDeletable, assertPatchAllowed,
  stripLockedOnUpsert, ProtectionError,
} from './protection';

describe('protection', () => {
  it('agente trava id/systemKey/kind', () => {
    expect(LOCKED_FIELDS.agent).toEqual(expect.arrayContaining(['id', 'systemKey', 'kind']));
    expect(isLockedField('agent', 'instructions')).toBe(false);
    expect(isLockedField('agent', 'kind')).toBe(true);
  });

  it('KB trava clientId', () => {
    expect(isLockedField('knowledgeBase', 'clientId')).toBe(true);
  });

  it('assertDeletable bloqueia system', () => {
    expect(() => assertDeletable('system')).toThrow(ProtectionError);
    expect(() => assertDeletable('user')).not.toThrow();
  });

  it('assertPatchAllowed bloqueia campo travado em system', () => {
    expect(() => assertPatchAllowed('agent', 'system', { kind: 'orchestrator' })).toThrow(ProtectionError);
    expect(() => assertPatchAllowed('agent', 'system', { instructions: 'x' })).not.toThrow();
    expect(() => assertPatchAllowed('agent', 'user', { kind: 'orchestrator' })).not.toThrow();
  });

  it('stripLockedOnUpsert preserva campos travados do doc system existente', () => {
    const existing = { kind: 'orchestrator', instructions: 'old', systemKey: 'sup' };
    const incoming = { kind: 'worker', instructions: 'new' };
    const out = stripLockedOnUpsert('agent', 'system', incoming, existing);
    expect(out.kind).toBe('orchestrator');   // travado: mantém o existente
    expect(out.instructions).toBe('new');     // editável: aplica o novo
  });

  it('stripLockedOnUpsert em user passa tudo', () => {
    const out = stripLockedOnUpsert('agent', 'user', { kind: 'worker' }, {});
    expect(out.kind).toBe('worker');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test src/features/ai-studio/protection.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`src/features/ai-studio/protection.ts`:

```typescript
export type AiEntityType = 'agent' | 'skill' | 'workflow' | 'knowledgeBase';

export class ProtectionError extends Error {
  status = 422 as const;
  constructor(message: string) { super(message); this.name = 'ProtectionError'; }
}

export const LOCKED_FIELDS: Record<AiEntityType, string[]> = {
  agent: ['id', 'systemKey', 'kind'],
  skill: ['id', 'systemKey'],
  workflow: ['id', 'systemKey'],
  knowledgeBase: ['id', 'systemKey', 'clientId'],
};

export function isLockedField(type: AiEntityType, field: string): boolean {
  return LOCKED_FIELDS[type].includes(field);
}

export function assertDeletable(origin: 'system' | 'user'): void {
  if (origin === 'system') {
    throw new ProtectionError('Registro de sistema não pode ser excluído.');
  }
}

export function assertPatchAllowed(
  type: AiEntityType, origin: 'system' | 'user', updates: Record<string, unknown>,
): void {
  if (origin !== 'system') return;
  for (const field of Object.keys(updates)) {
    if (isLockedField(type, field)) {
      throw new ProtectionError(`Campo "${field}" é travado em registros de sistema.`);
    }
  }
}

export function stripLockedOnUpsert(
  type: AiEntityType,
  existingOrigin: 'system' | 'user',
  incoming: Record<string, unknown>,
  existing: Record<string, unknown>,
): Record<string, unknown> {
  if (existingOrigin !== 'system') return { ...incoming };
  const out = { ...incoming };
  for (const field of LOCKED_FIELDS[type]) {
    if (field in existing) out[field] = existing[field];
    else delete out[field];
  }
  return out;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test src/features/ai-studio/protection.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/ai-studio/protection.ts src/features/ai-studio/protection.test.ts
git commit -m "feat(ai-studio): política de proteção sistema/usuário (campos travados)"
```

---

### Task 5: Entity config registry

**Files:**
- Create: `src/features/ai-studio/entity-config.ts`
- Test: `src/features/ai-studio/entity-config.test.ts`

**Interfaces:**
- Consumes: schemas da Task 2; `AiEntityType`/`LOCKED_FIELDS` da Task 4; `hasTool` da Task 3.
- Produces:
  - `interface RefSpec { field: string; kind: 'collection' | 'toolManifest'; collection?: string }`
  - `interface EntityConfig { type: AiEntityType; collection: string; docSchema: z.ZodType; editableOnPatch: string[]; refSpecs: RefSpec[] }`
  - `ENTITY_CONFIGS: Record<AiEntityType, EntityConfig>`
  - `getEntityConfig(type: AiEntityType): EntityConfig`

- [ ] **Step 1: Teste (falhando)**

`src/features/ai-studio/entity-config.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ENTITY_CONFIGS, getEntityConfig } from './entity-config';

describe('entity-config', () => {
  it('mapeia as 4 entidades às coleções corretas', () => {
    expect(ENTITY_CONFIGS.agent.collection).toBe('aiAgents');
    expect(ENTITY_CONFIGS.skill.collection).toBe('aiSkills');
    expect(ENTITY_CONFIGS.workflow.collection).toBe('aiWorkflows');
    expect(ENTITY_CONFIGS.knowledgeBase.collection).toBe('knowledgeBases');
  });
  it('agente define refSpecs de skill/tool/kb', () => {
    const fields = ENTITY_CONFIGS.agent.refSpecs.map((r) => r.field);
    expect(fields).toEqual(expect.arrayContaining(['skillRefs', 'toolRefs', 'knowledgeBaseRefs']));
    const toolSpec = ENTITY_CONFIGS.agent.refSpecs.find((r) => r.field === 'toolRefs');
    expect(toolSpec?.kind).toBe('toolManifest');
  });
  it('getEntityConfig lança em tipo inválido', () => {
    // @ts-expect-error tipo inválido proposital
    expect(() => getEntityConfig('foo')).toThrow();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test src/features/ai-studio/entity-config.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`src/features/ai-studio/entity-config.ts`:

```typescript
import type { z } from 'zod';
import type { AiEntityType } from './protection';
import { AiAgentDoc } from '@/shared/schemas/ai-studio/agent';
import { AiSkillDoc } from '@/shared/schemas/ai-studio/skill';
import { AiWorkflowDoc } from '@/shared/schemas/ai-studio/workflow';
import { KnowledgeBaseDoc } from '@/shared/schemas/ai-studio/knowledge-base';

export type { AiEntityType } from './protection';

export interface RefSpec {
  field: string;
  kind: 'collection' | 'toolManifest';
  collection?: string;
}

export interface EntityConfig {
  type: AiEntityType;
  collection: string;
  docSchema: z.ZodType;
  /** Campos que PATCH pode tocar (allowlist), espelha o PATCH de dashboard-templates. */
  editableOnPatch: string[];
  refSpecs: RefSpec[];
}

export const ENTITY_CONFIGS: Record<AiEntityType, EntityConfig> = {
  agent: {
    type: 'agent',
    collection: 'aiAgents',
    docSchema: AiAgentDoc,
    editableOnPatch: ['name', 'description', 'status', 'instructions', 'model', 'skillRefs', 'toolRefs', 'knowledgeBaseRefs'],
    refSpecs: [
      { field: 'skillRefs', kind: 'collection', collection: 'aiSkills' },
      { field: 'toolRefs', kind: 'toolManifest' },
      { field: 'knowledgeBaseRefs', kind: 'collection', collection: 'knowledgeBases' },
    ],
  },
  skill: {
    type: 'skill',
    collection: 'aiSkills',
    docSchema: AiSkillDoc,
    editableOnPatch: ['name', 'description', 'status', 'playbook', 'toolRefs', 'knowledgeBaseRefs'],
    refSpecs: [
      { field: 'toolRefs', kind: 'toolManifest' },
      { field: 'knowledgeBaseRefs', kind: 'collection', collection: 'knowledgeBases' },
    ],
  },
  workflow: {
    type: 'workflow',
    collection: 'aiWorkflows',
    docSchema: AiWorkflowDoc,
    editableOnPatch: ['name', 'description', 'status', 'instruction', 'isDefault'],
    refSpecs: [],
  },
  knowledgeBase: {
    type: 'knowledgeBase',
    collection: 'knowledgeBases',
    docSchema: KnowledgeBaseDoc,
    editableOnPatch: ['name', 'description', 'status'],
    refSpecs: [],
  },
};

export function getEntityConfig(type: AiEntityType): EntityConfig {
  const cfg = ENTITY_CONFIGS[type];
  if (!cfg) throw new Error(`Entidade AI Studio desconhecida: ${type}`);
  return cfg;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test src/features/ai-studio/entity-config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/ai-studio/entity-config.ts src/features/ai-studio/entity-config.test.ts
git commit -m "feat(ai-studio): registry de config por entidade (collection/schema/refs)"
```

---

### Task 6: Generic repo (AiStudioRepo)

**Files:**
- Create: `src/features/ai-studio/repo.ts`
- Test: `src/features/ai-studio/repo.test.ts`

**Interfaces:**
- Consumes: `EntityConfig`/`getEntityConfig` (Task 5); proteção (Task 4); `hasTool` (Task 3); seeds (Task 7 — para `reset`; nesta task `reset` recebe o seed via parâmetro injetado para não acoplar a ordem).
- Produces:
  - `interface AiStudioRecord { id: string; origin: 'system'|'user'; systemKey?: string; status: string; updatedAt?: string; [k: string]: unknown }`
  - `interface UpsertResult { id: string; warnings?: string[] }`
  - `class AiStudioRepo` com construtor `(type: AiEntityType, db?: FirebaseFirestore.Firestore)` e métodos:
    - `list(): Promise<AiStudioRecord[]>`
    - `get(id: string): Promise<AiStudioRecord | null>`
    - `upsert(id: string, body: Record<string, unknown>): Promise<UpsertResult>`
    - `patch(id: string, updates: Record<string, unknown>): Promise<void>`
    - `remove(id: string): Promise<void>`
    - `reset(id: string, seedDoc: Record<string, unknown>): Promise<void>`

- [ ] **Step 1: Teste (falhando)** — com um fake Firestore em memória

`src/features/ai-studio/repo.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { AiStudioRepo } from './repo';

// Fake Firestore mínimo (doc/collection/get/set/update/delete)
function makeFakeDb(initial: Record<string, Record<string, any>> = {}) {
  const store: Record<string, Record<string, any>> = JSON.parse(JSON.stringify(initial));
  return {
    store,
    collection(name: string) {
      store[name] ??= {};
      return {
        doc(id: string) {
          return {
            async get() {
              const data = store[name][id];
              return { exists: data !== undefined, id, data: () => data };
            },
            async set(value: any, opts?: { merge?: boolean }) {
              store[name][id] = opts?.merge ? { ...(store[name][id] ?? {}), ...value } : value;
            },
            async update(value: any) {
              if (store[name][id] === undefined) throw new Error('NOT_FOUND');
              store[name][id] = { ...store[name][id], ...value };
            },
            async delete() { delete store[name][id]; },
          };
        },
        async get() {
          const docs = Object.entries(store[name]).map(([id, data]) => ({ id, data: () => data }));
          return { docs };
        },
      };
    },
  } as any;
}

describe('AiStudioRepo', () => {
  let db: ReturnType<typeof makeFakeDb>;
  beforeEach(() => { db = makeFakeDb(); });

  it('upsert cria com origin=user e marca updatedAt/createdAt', async () => {
    const repo = new AiStudioRepo('skill', db);
    const res = await repo.upsert('safra', { name: 'Safra', playbook: 'p' });
    expect(res.id).toBe('safra');
    const stored = db.store.aiSkills.safra;
    expect(stored.origin).toBe('user');
    expect(stored.createdAt).toBeDefined();
    expect(stored.updatedAt).toBeDefined();
  });

  it('upsert nunca permite origin=system vindo do body', async () => {
    const repo = new AiStudioRepo('skill', db);
    await repo.upsert('x', { name: 'X', origin: 'system' });
    expect(db.store.aiSkills.x.origin).toBe('user');
  });

  it('upsert em doc system preserva campos travados', async () => {
    db.store.aiAgents = { sup: { name: 'Sup', kind: 'orchestrator', origin: 'system', systemKey: 'sup', instructions: 'old', model: 'router' } };
    const repo = new AiStudioRepo('agent', db);
    await repo.upsert('sup', { name: 'Sup', kind: 'worker', instructions: 'new', model: 'router' });
    expect(db.store.aiAgents.sup.kind).toBe('orchestrator'); // travado
    expect(db.store.aiAgents.sup.instructions).toBe('new');   // editável
    expect(db.store.aiAgents.sup.origin).toBe('system');      // preserva origin
  });

  it('upsert gera warnings para refs órfãs (soft)', async () => {
    const repo = new AiStudioRepo('agent', db);
    const res = await repo.upsert('a', { name: 'A', model: 'fast', skillRefs: ['nao-existe'], toolRefs: ['tool-fantasma'] });
    expect(res.warnings && res.warnings.length).toBeGreaterThanOrEqual(2);
  });

  it('upsert sem refs órfãs não retorna warnings', async () => {
    const repo = new AiStudioRepo('agent', db);
    const res = await repo.upsert('a', { name: 'A', model: 'fast', toolRefs: ['execute_sql'] });
    expect(res.warnings).toBeUndefined();
  });

  it('remove bloqueia system (ProtectionError)', async () => {
    db.store.aiSkills = { sys: { name: 'Sys', origin: 'system' } };
    const repo = new AiStudioRepo('skill', db);
    await expect(repo.remove('sys')).rejects.toMatchObject({ status: 422 });
  });

  it('remove permite user', async () => {
    db.store.aiSkills = { u: { name: 'U', origin: 'user' } };
    const repo = new AiStudioRepo('skill', db);
    await repo.remove('u');
    expect(db.store.aiSkills.u).toBeUndefined();
  });

  it('patch bloqueia campo travado em system', async () => {
    db.store.aiAgents = { sup: { name: 'Sup', origin: 'system', kind: 'orchestrator' } };
    const repo = new AiStudioRepo('agent', db);
    await expect(repo.patch('sup', { kind: 'worker' })).rejects.toMatchObject({ status: 422 });
  });

  it('patch só aplica campos da allowlist', async () => {
    db.store.aiSkills = { u: { name: 'U', origin: 'user', playbook: 'old' } };
    const repo = new AiStudioRepo('skill', db);
    await repo.patch('u', { playbook: 'new', hacker: 'x' } as any);
    expect(db.store.aiSkills.u.playbook).toBe('new');
    expect(db.store.aiSkills.u.hacker).toBeUndefined();
  });

  it('list serializa id/origin/status', async () => {
    db.store.aiSkills = { u: { name: 'U', origin: 'user', status: 'active' } };
    const repo = new AiStudioRepo('skill', db);
    const rows = await repo.list();
    expect(rows[0]).toMatchObject({ id: 'u', origin: 'user', status: 'active' });
  });

  it('reset re-semeia o doc a partir do seed', async () => {
    db.store.aiAgents = { sup: { name: 'editado', origin: 'system', systemKey: 'sup', kind: 'orchestrator' } };
    const repo = new AiStudioRepo('agent', db);
    await repo.reset('sup', { name: 'Supervisor', kind: 'orchestrator', instructions: 'base', model: 'router', origin: 'system', systemKey: 'sup' });
    expect(db.store.aiAgents.sup.name).toBe('Supervisor');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test src/features/ai-studio/repo.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`src/features/ai-studio/repo.ts`:

```typescript
import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from '@/shared/lib/firebase/admin';
import { getEntityConfig, type EntityConfig } from './entity-config';
import type { AiEntityType } from './protection';
import { assertDeletable, assertPatchAllowed, stripLockedOnUpsert } from './protection';
import { hasTool } from './tools-manifest';

export interface AiStudioRecord {
  id: string;
  origin: 'system' | 'user';
  systemKey?: string;
  status: string;
  updatedAt?: string;
  [k: string]: unknown;
}

export interface UpsertResult {
  id: string;
  warnings?: string[];
}

function toIso(v: unknown): string | undefined {
  if (v && typeof (v as { toDate?: () => Date }).toDate === 'function') {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return undefined;
}

export class AiStudioRepo {
  private cfg: EntityConfig;
  private db: FirebaseFirestore.Firestore;

  constructor(type: AiEntityType, db?: FirebaseFirestore.Firestore) {
    this.cfg = getEntityConfig(type);
    this.db = db ?? getDb();
  }

  private col() { return this.db.collection(this.cfg.collection); }

  private serialize(id: string, data: FirebaseFirestore.DocumentData): AiStudioRecord {
    const parsed = this.cfg.docSchema.parse({ ...data }) as Record<string, unknown>;
    return {
      ...parsed,
      id,
      origin: (data.origin as 'system' | 'user') ?? 'user',
      systemKey: data.systemKey,
      status: (data.status as string) ?? 'active',
      updatedAt: toIso(data.updatedAt),
    };
  }

  async list(): Promise<AiStudioRecord[]> {
    const snap = await this.col().get();
    return snap.docs.map((d) => this.serialize(d.id, d.data()));
  }

  async get(id: string): Promise<AiStudioRecord | null> {
    const snap = await this.col().doc(id).get();
    if (!snap.exists) return null;
    return this.serialize(snap.id, snap.data()!);
  }

  private async collectWarnings(doc: Record<string, unknown>): Promise<string[]> {
    const warnings: string[] = [];
    for (const spec of this.cfg.refSpecs) {
      const refs = (doc[spec.field] as string[] | undefined) ?? [];
      for (const ref of refs) {
        if (spec.kind === 'toolManifest') {
          if (!hasTool(ref)) warnings.push(`${spec.field} "${ref}" inexistente no catálogo de tools`);
        } else {
          const exists = (await this.db.collection(spec.collection!).doc(ref).get()).exists;
          if (!exists) warnings.push(`${spec.field} "${ref}" inexistente em ${spec.collection}`);
        }
      }
    }
    return warnings;
  }

  async upsert(id: string, body: Record<string, unknown>): Promise<UpsertResult> {
    // 1. valida o payload pelo schema da entidade (aplica defaults)
    const parsed = this.cfg.docSchema.parse({ ...body });
    let doc = parsed as Record<string, unknown>;

    // 2. proteção: admin nunca cria system; em system existente preserva travados
    const existingSnap = await this.col().doc(id).get();
    const existing = existingSnap.exists ? existingSnap.data()! : {};
    const existingOrigin = (existing.origin as 'system' | 'user') ?? 'user';
    doc = stripLockedOnUpsert(this.cfg.type, existingOrigin, doc, existing);
    doc.origin = existingSnap.exists ? existingOrigin : 'user';
    if (existing.systemKey) doc.systemKey = existing.systemKey;

    // 3. soft-refs (warning, não bloqueia)
    const warnings = await this.collectWarnings(doc);

    // 4. persiste
    await this.col().doc(id).set(
      {
        ...doc,
        updatedAt: FieldValue.serverTimestamp(),
        ...(existingSnap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      },
      { merge: true },
    );
    return { id, ...(warnings.length > 0 ? { warnings } : {}) };
  }

  async patch(id: string, updates: Record<string, unknown>): Promise<void> {
    const snap = await this.col().doc(id).get();
    if (!snap.exists) throw new Error('Registro não encontrado');
    const origin = (snap.data()!.origin as 'system' | 'user') ?? 'user';
    assertPatchAllowed(this.cfg.type, origin, updates);
    const clean: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    for (const key of this.cfg.editableOnPatch) {
      if (updates[key] !== undefined) clean[key] = updates[key];
    }
    await this.col().doc(id).update(clean);
  }

  async remove(id: string): Promise<void> {
    const snap = await this.col().doc(id).get();
    if (!snap.exists) return;
    const origin = (snap.data()!.origin as 'system' | 'user') ?? 'user';
    assertDeletable(origin);
    await this.col().doc(id).delete();
  }

  async reset(id: string, seedDoc: Record<string, unknown>): Promise<void> {
    await this.col().doc(id).set(
      { ...seedDoc, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test src/features/ai-studio/repo.test.ts`
Expected: PASS.

> Nota: `serialize` chama `docSchema.parse`. Os seeds e o fake-db devem conter os campos mínimos; campos ausentes recebem default do schema. Se `parse` falhar em dados legados, capturar e logar não é necessário aqui (dados são controlados pelo próprio repo).

- [ ] **Step 5: Commit**

```bash
git add src/features/ai-studio/repo.ts src/features/ai-studio/repo.test.ts
git commit -m "feat(ai-studio): AiStudioRepo genérico (CRUD + proteção + soft-refs)"
```

---

### Task 7: Seed manifest + ensure-seed idempotente

**Files:**
- Create: `src/features/ai-studio/seed/manifest.ts`
- Create: `src/features/ai-studio/seed/ensure-seed.ts`
- Test: `src/features/ai-studio/seed/ensure-seed.test.ts`

**Interfaces:**
- Consumes: `AiStudioRepo` (Task 6) — na verdade escreve direto via repo/`db` para controlar `origin:'system'` (o repo força `user` no upsert, então o seeder grava direto na coleção).
- Produces:
  - `interface SeedRecord { type: AiEntityType; id: string; doc: Record<string, unknown> }`
  - `SYSTEM_SEEDS: SeedRecord[]`
  - `getSeed(type: AiEntityType, id: string): SeedRecord | undefined`
  - `async function ensureSeed(db?: FirebaseFirestore.Firestore): Promise<void>` — idempotente: cria docs ausentes com `origin:'system'`; se já existe, não sobrescreve (preserva edições do admin e `createdAt`).

- [ ] **Step 1: Teste (falhando)**

`src/features/ai-studio/seed/ensure-seed.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ensureSeed } from './ensure-seed';
import { SYSTEM_SEEDS } from './manifest';

function makeFakeDb() {
  const store: Record<string, Record<string, any>> = {};
  return {
    store,
    collection(name: string) {
      store[name] ??= {};
      return {
        doc(id: string) {
          return {
            async get() { const d = store[name][id]; return { exists: d !== undefined, id, data: () => d }; },
            async set(v: any, opts?: { merge?: boolean }) { store[name][id] = opts?.merge ? { ...(store[name][id] ?? {}), ...v } : v; },
          };
        },
      };
    },
  } as any;
}

describe('ensureSeed', () => {
  let db: ReturnType<typeof makeFakeDb>;
  beforeEach(() => { db = makeFakeDb(); });

  it('semeia os 8 agentes + supervisor + workflow default + KB default', () => {
    expect(SYSTEM_SEEDS.filter((s) => s.type === 'agent').length).toBeGreaterThanOrEqual(9);
    expect(SYSTEM_SEEDS.some((s) => s.type === 'workflow' && s.doc.isDefault === true)).toBe(true);
    expect(SYSTEM_SEEDS.some((s) => s.type === 'knowledgeBase' && s.id === 'default')).toBe(true);
  });

  it('todos os seeds têm origin=system e systemKey', () => {
    for (const s of SYSTEM_SEEDS) {
      expect(s.doc.origin).toBe('system');
      expect(s.doc.systemKey).toBeTruthy();
    }
  });

  it('cria docs ausentes', async () => {
    await ensureSeed(db);
    expect(db.store.aiAgents.descriptive).toBeDefined();
    expect(db.store.aiAgents.descriptive.origin).toBe('system');
  });

  it('é idempotente: não sobrescreve edições nem duplica', async () => {
    await ensureSeed(db);
    db.store.aiAgents.descriptive.instructions = 'EDITADO PELO ADMIN';
    await ensureSeed(db);
    expect(db.store.aiAgents.descriptive.instructions).toBe('EDITADO PELO ADMIN');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test src/features/ai-studio/seed/ensure-seed.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar manifest**

`src/features/ai-studio/seed/manifest.ts` (instruções concisas reais por agente; expandir depois extraindo dos builders):

```typescript
import type { AiEntityType } from '../protection';

export interface SeedRecord {
  type: AiEntityType;
  id: string;
  doc: Record<string, unknown>;
}

function agent(id: string, name: string, instructions: string, extra: Record<string, unknown> = {}): SeedRecord {
  return {
    type: 'agent', id,
    doc: {
      name, instructions, kind: 'worker', model: 'fast', status: 'active',
      origin: 'system', systemKey: id, description: name,
      skillRefs: [], toolRefs: [], knowledgeBaseRefs: [],
      ...extra,
    },
  };
}

export const SYSTEM_SEEDS: SeedRecord[] = [
  agent('orchestrator', 'Supervisor Analítico',
    'Você é o supervisor analítico. Roteie o pedido do usuário para os sub-agentes adequados e componha a resposta final. Siga a instrução do workflow ativo.',
    { kind: 'orchestrator', model: 'router' }),
  agent('descriptive', 'Agente Descritivo',
    'Descreva o estado da carteira com dados: totais, distribuições e composição. Use execute_sql e o glossário; nunca invente números.',
    { toolRefs: ['execute_sql', 'bq_dry_run_sql', 'lookup_glossary', 'vector_query'] }),
  agent('diagnostic', 'Agente Diagnóstico',
    'Explique o porquê das variações observadas (inadimplência, PDD, LTV) com decomposição e correlações.',
    { toolRefs: ['execute_sql', 'calculate_statistics'] }),
  agent('predictive', 'Agente Preditivo',
    'Projete tendências (inadimplência/recebíveis) usando BQML e curvas de safra; sempre informe incerteza.',
    { model: 'slow', toolRefs: ['bqml_forecast', 'build_vintage_curves'] }),
  agent('prescriptive', 'Agente Prescritivo',
    'Recomende ações (repasse, cobrança, provisionamento) priorizadas por impacto e elegibilidade.',
    { model: 'slow', toolRefs: ['execute_sql'] }),
  agent('monitoring', 'Agente de Monitoramento',
    'Acompanhe covenants e gatilhos; sinalize desvios e limites próximos de violação.',
    { toolRefs: ['execute_sql'] }),
  agent('simulation', 'Agente de Simulação',
    'Rode cenários e stress tests (ex: choque de LTV) via Monte Carlo e sensibilidade.',
    { model: 'slow', toolRefs: ['run_monte_carlo'] }),
  agent('external', 'Agente Externo',
    'Traga contexto de mercado/macroeconômico (indicadores BCB, web) e relacione à carteira.',
    { toolRefs: ['search_web', 'get_bcb_indicator'] }),
  agent('cashflow', 'Agente de Fluxo de Caixa',
    'Projete e analise fluxos de caixa de recebíveis e repasses ao longo do tempo.',
    { model: 'slow', toolRefs: ['execute_sql'] }),
  {
    type: 'workflow', id: 'default',
    doc: {
      name: 'Atendimento Analítico Padrão',
      description: 'Fluxo padrão para qualquer pergunta analítica sobre a carteira de crédito.',
      instruction: 'Ao receber um comando, identifique a intenção (descritiva, diagnóstica, preditiva, prescritiva). Acione o(s) agente(s) correspondente(s), priorizando dados reais via SQL, e componha uma resposta clara com citações de fonte quando houver afirmação numérica ou regulatória.',
      isDefault: true, status: 'active', origin: 'system', systemKey: 'default',
    },
  },
  {
    type: 'knowledgeBase', id: 'default',
    doc: {
      name: 'Base de Conhecimento Padrão',
      description: 'Documentos gerais (mercado, produto, negócio) — absorve os embeddings legados.',
      clientId: null, embeddingModel: 'gemini-embedding-001', docCount: 0, chunkCount: 0,
      status: 'active', origin: 'system', systemKey: 'default',
    },
  },
];

const COLLECTION_BY_TYPE: Record<AiEntityType, string> = {
  agent: 'aiAgents', skill: 'aiSkills', workflow: 'aiWorkflows', knowledgeBase: 'knowledgeBases',
};
export function collectionForType(type: AiEntityType): string { return COLLECTION_BY_TYPE[type]; }

export function getSeed(type: AiEntityType, id: string): SeedRecord | undefined {
  return SYSTEM_SEEDS.find((s) => s.type === type && s.id === id);
}
```

- [ ] **Step 4: Implementar ensure-seed**

`src/features/ai-studio/seed/ensure-seed.ts`:

```typescript
import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from '@/shared/lib/firebase/admin';
import { SYSTEM_SEEDS, collectionForType } from './manifest';

/** Idempotente: cria docs de sistema ausentes; nunca sobrescreve docs existentes. */
export async function ensureSeed(db?: FirebaseFirestore.Firestore): Promise<void> {
  const firestore = db ?? getDb();
  for (const seed of SYSTEM_SEEDS) {
    const ref = firestore.collection(collectionForType(seed.type)).doc(seed.id);
    const snap = await ref.get();
    if (snap.exists) continue; // preserva edições do admin
    await ref.set({
      ...seed.doc,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm test src/features/ai-studio/seed/ensure-seed.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/ai-studio/seed
git commit -m "feat(ai-studio): seeds de sistema (8 agentes + supervisor + workflow/KB default) idempotentes"
```

---

### Task 8: Route factory (handlers genéricos)

**Files:**
- Create: `app/api/ai-studio/route-factory.ts`
- Test: `app/api/ai-studio/__tests__/route-factory.test.ts`

**Interfaces:**
- Consumes: `AiStudioRepo` (Task 6); `getSeed` (Task 7); `requireAdmin`/`isAdminAuthOk`; `Slug`.
- Produces: `function makeAiStudioRoutes(type: AiEntityType): { GET; POST; PATCH; DELETE }` — handlers no formato Next (recebem `Request`, retornam `Response`). POST suporta `{action:'reset', id}`.

- [ ] **Step 1: Teste (falhando)**

`app/api/ai-studio/__tests__/route-factory.test.ts`:

```typescript
/* @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

const { requireAdminMock, repoState, getSeedMock } = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  repoState: {
    list: vi.fn(), get: vi.fn(), upsert: vi.fn(), patch: vi.fn(), remove: vi.fn(), reset: vi.fn(),
  },
  getSeedMock: vi.fn(),
}));

vi.mock('@/shared/lib/auth/require-admin', () => ({
  requireAdmin: requireAdminMock,
  isAdminAuthOk: (r: unknown) => typeof (r as { uid?: unknown })?.uid === 'string',
}));
vi.mock('@/features/ai-studio/repo', () => ({
  AiStudioRepo: vi.fn().mockImplementation(() => repoState),
}));
vi.mock('@/features/ai-studio/seed/manifest', () => ({ getSeed: getSeedMock }));

import { makeAiStudioRoutes } from '../route-factory';
import { ProtectionError } from '@/features/ai-studio/protection';

const { GET, POST, PATCH, DELETE } = makeAiStudioRoutes('skill');

function req(url: string, method = 'GET', body?: unknown) {
  return new Request(url, method === 'GET' || method === 'DELETE'
    ? { method }
    : { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

beforeEach(() => {
  Object.values(repoState).forEach((m) => (m as any).mockReset());
  requireAdminMock.mockReset();
  getSeedMock.mockReset();
});

describe('makeAiStudioRoutes', () => {
  it('GET 401 quando requireAdmin falha', async () => {
    requireAdminMock.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 401 }));
    expect((await GET(req('http://x/api/ai-studio/skills'))).status).toBe(401);
  });

  it('GET lista', async () => {
    requireAdminMock.mockResolvedValueOnce({ uid: 'a' });
    repoState.list.mockResolvedValueOnce([{ id: 's1' }]);
    const res = await GET(req('http://x/api/ai-studio/skills'));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toHaveLength(1);
  });

  it('GET por id 404', async () => {
    requireAdminMock.mockResolvedValueOnce({ uid: 'a' });
    repoState.get.mockResolvedValueOnce(null);
    expect((await GET(req('http://x/api/ai-studio/skills?id=nope'))).status).toBe(404);
  });

  it('POST upsert retorna id + warnings', async () => {
    requireAdminMock.mockResolvedValueOnce({ uid: 'a' });
    repoState.upsert.mockResolvedValueOnce({ id: 'safra', warnings: ['x'] });
    const res = await POST(req('http://x/api/ai-studio/skills', 'POST', { id: 'safra', name: 'Safra' }));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ id: 'safra', warnings: ['x'] });
  });

  it('POST id inválido 400', async () => {
    requireAdminMock.mockResolvedValueOnce({ uid: 'a' });
    const res = await POST(req('http://x/api/ai-studio/skills', 'POST', { id: 'Bad Id', name: 'X' }));
    expect(res.status).toBe(400);
  });

  it('POST action=reset chama repo.reset com o seed', async () => {
    requireAdminMock.mockResolvedValueOnce({ uid: 'a' });
    getSeedMock.mockReturnValueOnce({ doc: { name: 'Seed' } });
    repoState.reset.mockResolvedValueOnce(undefined);
    const res = await POST(req('http://x/api/ai-studio/skills', 'POST', { action: 'reset', id: 'descriptive' }));
    expect(res.status).toBe(200);
    expect(repoState.reset).toHaveBeenCalledWith('descriptive', { name: 'Seed' });
  });

  it('POST action=reset 404 quando não há seed', async () => {
    requireAdminMock.mockResolvedValueOnce({ uid: 'a' });
    getSeedMock.mockReturnValueOnce(undefined);
    const res = await POST(req('http://x/api/ai-studio/skills', 'POST', { action: 'reset', id: 'foo' }));
    expect(res.status).toBe(404);
  });

  it('DELETE bloqueado em system vira 422', async () => {
    requireAdminMock.mockResolvedValueOnce({ uid: 'a' });
    repoState.remove.mockRejectedValueOnce(new ProtectionError('nope'));
    expect((await DELETE(req('http://x/api/ai-studio/skills?id=sys', 'DELETE'))).status).toBe(422);
  });

  it('PATCH campo travado vira 422', async () => {
    requireAdminMock.mockResolvedValueOnce({ uid: 'a' });
    repoState.patch.mockRejectedValueOnce(new ProtectionError('nope'));
    const res = await PATCH(req('http://x/api/ai-studio/skills', 'PATCH', { id: 'sys', kind: 'x' }));
    expect(res.status).toBe(422);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test app/api/ai-studio/__tests__/route-factory.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`app/api/ai-studio/route-factory.ts`:

```typescript
import { NextResponse } from 'next/server';
import { requireAdmin, isAdminAuthOk } from '@/shared/lib/auth/require-admin';
import { Slug } from '@/shared/schemas/identifier';
import { AiStudioRepo } from '@/features/ai-studio/repo';
import { getSeed } from '@/features/ai-studio/seed/manifest';
import { ProtectionError } from '@/features/ai-studio/protection';
import type { AiEntityType } from '@/features/ai-studio/protection';

function errStatus(e: unknown): number {
  if (e instanceof ProtectionError) return e.status;
  return 500;
}
function msg(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

export function makeAiStudioRoutes(type: AiEntityType) {
  const repo = () => new AiStudioRepo(type);

  async function GET(req: Request) {
    const auth = await requireAdmin(req);
    if (!isAdminAuthOk(auth)) return auth;
    try {
      const id = new URL(req.url).searchParams.get('id');
      if (id) {
        const data = await repo().get(id);
        if (!data) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
        return NextResponse.json({ data });
      }
      return NextResponse.json({ data: await repo().list() });
    } catch (e) {
      return NextResponse.json({ error: msg(e, 'Erro ao listar') }, { status: 500 });
    }
  }

  async function POST(req: Request) {
    const auth = await requireAdmin(req);
    if (!isAdminAuthOk(auth)) return auth;
    try {
      const body = await req.json();

      if (body.action === 'reset') {
        if (!body.id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 });
        const seed = getSeed(type, body.id);
        if (!seed) return NextResponse.json({ error: 'Sem seed para restaurar' }, { status: 404 });
        await repo().reset(body.id, seed.doc);
        return NextResponse.json({ data: { id: body.id } });
      }

      const idResult = Slug.safeParse(body.id);
      if (!idResult.success) return NextResponse.json({ error: 'id inválido (kebab-case)' }, { status: 400 });
      const { id, action, ...payload } = body;
      const result = await repo().upsert(idResult.data, payload);
      return NextResponse.json({ data: result });
    } catch (e) {
      return NextResponse.json({ error: msg(e, 'Erro ao salvar') }, { status: errStatus(e) });
    }
  }

  async function PATCH(req: Request) {
    const auth = await requireAdmin(req);
    if (!isAdminAuthOk(auth)) return auth;
    try {
      const body = await req.json();
      if (!body.id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 });
      const { id, ...updates } = body;
      await repo().patch(id, updates);
      return NextResponse.json({ ok: true });
    } catch (e) {
      return NextResponse.json({ error: msg(e, 'Erro ao atualizar') }, { status: errStatus(e) });
    }
  }

  async function DELETE(req: Request) {
    const auth = await requireAdmin(req);
    if (!isAdminAuthOk(auth)) return auth;
    try {
      const id = new URL(req.url).searchParams.get('id');
      if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 });
      await repo().remove(id);
      return NextResponse.json({ ok: true });
    } catch (e) {
      return NextResponse.json({ error: msg(e, 'Erro ao excluir') }, { status: errStatus(e) });
    }
  }

  return { GET, POST, PATCH, DELETE };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test app/api/ai-studio/__tests__/route-factory.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/ai-studio/route-factory.ts app/api/ai-studio/__tests__/route-factory.test.ts
git commit -m "feat(ai-studio): route factory genérica (GET/POST/PATCH/DELETE/reset)"
```

---

### Task 9: Rotas por entidade + tools (read-only)

**Files:**
- Create: `app/api/ai-studio/agents/route.ts`
- Create: `app/api/ai-studio/skills/route.ts`
- Create: `app/api/ai-studio/workflows/route.ts`
- Create: `app/api/ai-studio/kb/route.ts`
- Create: `app/api/ai-studio/tools/route.ts`
- Test: `app/api/ai-studio/__tests__/routes-smoke.test.ts`

**Interfaces:**
- Consumes: `makeAiStudioRoutes` (Task 8); `listTools` (Task 3); `requireAdmin`.

- [ ] **Step 1: Teste (falhando)**

`app/api/ai-studio/__tests__/routes-smoke.test.ts`:

```typescript
/* @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { requireAdminMock } = vi.hoisted(() => ({ requireAdminMock: vi.fn() }));
vi.mock('@/shared/lib/auth/require-admin', () => ({
  requireAdmin: requireAdminMock,
  isAdminAuthOk: (r: unknown) => typeof (r as { uid?: unknown })?.uid === 'string',
}));

import * as toolsRoute from '../tools/route';
import * as agentsRoute from '../agents/route';

describe('rotas ai-studio (smoke)', () => {
  beforeEach(() => requireAdminMock.mockReset());

  it('agents exporta os 4 verbos', () => {
    for (const v of ['GET', 'POST', 'PATCH', 'DELETE']) {
      expect(typeof (agentsRoute as Record<string, unknown>)[v]).toBe('function');
    }
  });

  it('tools GET retorna o manifest', async () => {
    requireAdminMock.mockResolvedValueOnce({ uid: 'a' });
    const res = await toolsRoute.GET(new Request('http://x/api/ai-studio/tools'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data.some((t: { key: string }) => t.key === 'execute_sql')).toBe(true);
  });

  it('tools GET 401 sem admin', async () => {
    const { NextResponse } = await import('next/server');
    requireAdminMock.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 401 }));
    expect((await toolsRoute.GET(new Request('http://x/api/ai-studio/tools'))).status).toBe(401);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test app/api/ai-studio/__tests__/routes-smoke.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar as rotas**

`app/api/ai-studio/agents/route.ts`:

```typescript
import { makeAiStudioRoutes } from '../route-factory';
export const runtime = 'nodejs';
export const { GET, POST, PATCH, DELETE } = makeAiStudioRoutes('agent');
```

`app/api/ai-studio/skills/route.ts`:

```typescript
import { makeAiStudioRoutes } from '../route-factory';
export const runtime = 'nodejs';
export const { GET, POST, PATCH, DELETE } = makeAiStudioRoutes('skill');
```

`app/api/ai-studio/workflows/route.ts`:

```typescript
import { makeAiStudioRoutes } from '../route-factory';
export const runtime = 'nodejs';
export const { GET, POST, PATCH, DELETE } = makeAiStudioRoutes('workflow');
```

`app/api/ai-studio/kb/route.ts`:

```typescript
import { makeAiStudioRoutes } from '../route-factory';
export const runtime = 'nodejs';
export const { GET, POST, PATCH, DELETE } = makeAiStudioRoutes('knowledgeBase');
```

`app/api/ai-studio/tools/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { requireAdmin, isAdminAuthOk } from '@/shared/lib/auth/require-admin';
import { listTools } from '@/features/ai-studio/tools-manifest';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (!isAdminAuthOk(auth)) return auth;
  return NextResponse.json({ data: listTools() });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test app/api/ai-studio/__tests__/routes-smoke.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/ai-studio
git commit -m "feat(ai-studio): rotas agents/skills/workflows/kb + tools (read-only)"
```

---

### Task 10: Client API lib (fetch wrappers)

**Files:**
- Create: `src/features/ai-studio/admin/model/api.ts`
- Test: `src/features/ai-studio/admin/model/api.test.ts`

**Interfaces:**
- Consumes: `getToken` (importado de `@/shared/lib/firestore/dashboard-templates`? Não — `getToken` é privado lá. Replicar o helper aqui em `api.ts`, idêntico ao de `dashboard-templates.ts`).
- Produces: `interface AiStudioApi { list; get; save; patch; remove; reset }` via factory `makeAiStudioApi(entityPath: 'agents'|'skills'|'workflows'|'kb')`; e `fetchTools()`. `save` retorna `{ id; warnings?: string[] }`.

- [ ] **Step 1: Teste (falhando)** — com `fetch` global mockado

`src/features/ai-studio/admin/model/api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/shared/lib/external-token', () => ({ getExternalToken: () => 'tok' }));

import { makeAiStudioApi, fetchTools } from './api';

const api = makeAiStudioApi('skills');

function mockFetch(json: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok, status, json: async () => json,
  });
}

beforeEach(() => { vi.restoreAllMocks(); });

describe('ai-studio client api', () => {
  it('list chama GET /api/ai-studio/skills e retorna data', async () => {
    const f = mockFetch({ data: [{ id: 's1' }] });
    vi.stubGlobal('fetch', f);
    const rows = await api.list();
    expect(rows).toHaveLength(1);
    expect(f.mock.calls[0][0]).toBe('/api/ai-studio/skills');
  });

  it('save faz POST e propaga warnings', async () => {
    const f = mockFetch({ data: { id: 'safra', warnings: ['ref órfã'] } });
    vi.stubGlobal('fetch', f);
    const res = await api.save({ id: 'safra', name: 'Safra' });
    expect(res.id).toBe('safra');
    expect(res.warnings).toEqual(['ref órfã']);
    expect(f.mock.calls[0][1].method).toBe('POST');
  });

  it('reset faz POST com action=reset', async () => {
    const f = mockFetch({ data: { id: 'descriptive' } });
    vi.stubGlobal('fetch', f);
    await api.reset('descriptive');
    expect(JSON.parse(f.mock.calls[0][1].body)).toMatchObject({ action: 'reset', id: 'descriptive' });
  });

  it('remove faz DELETE com id na query', async () => {
    const f = mockFetch({ ok: true });
    vi.stubGlobal('fetch', f);
    await api.remove('u1');
    expect(f.mock.calls[0][0]).toContain('id=u1');
    expect(f.mock.calls[0][1].method).toBe('DELETE');
  });

  it('lança erro quando !ok', async () => {
    vi.stubGlobal('fetch', mockFetch({ error: 'boom' }, false, 422));
    await expect(api.remove('sys')).rejects.toThrow('boom');
  });

  it('fetchTools chama /api/ai-studio/tools', async () => {
    const f = mockFetch({ data: [{ key: 'execute_sql' }] });
    vi.stubGlobal('fetch', f);
    const tools = await fetchTools();
    expect(tools[0].key).toBe('execute_sql');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test src/features/ai-studio/admin/model/api.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`src/features/ai-studio/admin/model/api.ts`:

```typescript
import type { ToolDescriptor } from '@/features/ai-studio/tools-manifest';

async function getToken(): Promise<string> {
  const { getExternalToken } = await import('@/shared/lib/external-token');
  const externalToken = getExternalToken();
  if (externalToken) return externalToken;
  const { getFirebaseAuth } = await import('@/shared/lib/firebase/config');
  const auth = getFirebaseAuth();
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Not authenticated');
  return token;
}
function headers(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export interface AiStudioRecordLike { id: string; [k: string]: unknown }
export interface SaveResult { id: string; warnings?: string[] }
export type EntityPath = 'agents' | 'skills' | 'workflows' | 'kb';

async function unwrap(res: Response, fallback: string) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || fallback);
  }
  return res.json();
}

export function makeAiStudioApi(path: EntityPath) {
  const BASE = `/api/ai-studio/${path}`;
  return {
    async list(): Promise<AiStudioRecordLike[]> {
      const token = await getToken();
      const body = await unwrap(await fetch(BASE, { headers: headers(token) }), 'Falha ao listar');
      return body.data ?? [];
    },
    async get(id: string): Promise<AiStudioRecordLike | null> {
      const token = await getToken();
      const res = await fetch(`${BASE}?id=${encodeURIComponent(id)}`, { headers: headers(token) });
      if (res.status === 404) return null;
      const body = await unwrap(res, 'Falha ao buscar');
      return body.data ?? null;
    },
    async save(record: { id: string } & Record<string, unknown>): Promise<SaveResult> {
      const token = await getToken();
      const body = await unwrap(
        await fetch(BASE, { method: 'POST', headers: headers(token), body: JSON.stringify(record) }),
        'Falha ao salvar',
      );
      const warnings = body.data?.warnings;
      return { id: body.data.id, ...(Array.isArray(warnings) && warnings.length ? { warnings } : {}) };
    },
    async patch(id: string, updates: Record<string, unknown>): Promise<void> {
      const token = await getToken();
      await unwrap(
        await fetch(BASE, { method: 'PATCH', headers: headers(token), body: JSON.stringify({ id, ...updates }) }),
        'Falha ao atualizar',
      );
    },
    async remove(id: string): Promise<void> {
      const token = await getToken();
      await unwrap(
        await fetch(`${BASE}?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers: headers(token) }),
        'Falha ao excluir',
      );
    },
    async reset(id: string): Promise<void> {
      const token = await getToken();
      await unwrap(
        await fetch(BASE, { method: 'POST', headers: headers(token), body: JSON.stringify({ action: 'reset', id }) }),
        'Falha ao restaurar',
      );
    },
  };
}

export async function fetchTools(): Promise<ToolDescriptor[]> {
  const token = await getToken();
  const body = await unwrap(await fetch('/api/ai-studio/tools', { headers: headers(token) }), 'Falha ao listar tools');
  return body.data ?? [];
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test src/features/ai-studio/admin/model/api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/ai-studio/admin/model/api.ts src/features/ai-studio/admin/model/api.test.ts
git commit -m "feat(ai-studio): client API lib (fetch wrappers por entidade + tools)"
```

---

### Task 11: Admin nav + AdminPage wiring

**Files:**
- Modify: `src/features/admin/model/admin-nav.ts`
- Modify: `src/features/admin/ui/AdminPage.tsx:36-42` (bloco de seções)
- Test: `src/features/admin/model/admin-nav.test.ts`

**Interfaces:**
- Consumes: nada novo.
- Produces: novos `AdminSectionId` (`ai-agents`, `ai-skills`, `ai-knowledge-bases`, `ai-workflows`, `ai-tools`), novo grupo `'ai-studio'`.

- [ ] **Step 1: Teste (falhando)**

`src/features/admin/model/admin-nav.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ADMIN_SECTIONS, ADMIN_GROUP_ORDER, ADMIN_GROUP_LABELS, isAdminSectionId } from './admin-nav';

describe('admin-nav AI Studio', () => {
  it('inclui as 5 seções do AI Studio no grupo ai-studio', () => {
    const aiSections = ADMIN_SECTIONS.filter((s) => s.group === 'ai-studio').map((s) => s.id);
    expect(aiSections).toEqual(expect.arrayContaining([
      'ai-agents', 'ai-skills', 'ai-knowledge-bases', 'ai-workflows', 'ai-tools',
    ]));
  });
  it('grupo ai-studio está na ordem e tem label', () => {
    expect(ADMIN_GROUP_ORDER).toContain('ai-studio');
    expect(ADMIN_GROUP_LABELS['ai-studio']).toBeTruthy();
  });
  it('isAdminSectionId reconhece nova seção e rejeita inválida', () => {
    expect(isAdminSectionId('ai-agents')).toBe(true);
    expect(isAdminSectionId('foo')).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test src/features/admin/model/admin-nav.test.ts`
Expected: FAIL.

- [ ] **Step 3: Modificar admin-nav.ts**

Em `src/features/admin/model/admin-nav.ts`, estender o union, o array, o grupo e os labels:

```typescript
export type AdminSectionId =
  | 'data-contracts'
  | 'metrics'
  | 'templates'
  | 'products'
  | 'clients'
  | 'groups'
  | 'users'
  | 'ai-agents'
  | 'ai-skills'
  | 'ai-knowledge-bases'
  | 'ai-workflows'
  | 'ai-tools';

export type AdminGroup = 'semantic' | 'commercial' | 'tenants' | 'ai-studio';
```

Adicionar ao final de `ADMIN_SECTIONS`:

```typescript
  { id: 'ai-agents',          label: 'Agentes',          group: 'ai-studio' },
  { id: 'ai-skills',          label: 'Skills',           group: 'ai-studio' },
  { id: 'ai-knowledge-bases', label: 'Knowledge Bases',  group: 'ai-studio' },
  { id: 'ai-workflows',       label: 'Workflows',        group: 'ai-studio' },
  { id: 'ai-tools',           label: 'Tools',            group: 'ai-studio' },
```

Atualizar `ADMIN_GROUP_ORDER` e `ADMIN_GROUP_LABELS`:

```typescript
export const ADMIN_GROUP_ORDER: AdminGroup[] = ['semantic', 'commercial', 'tenants', 'ai-studio'];

export const ADMIN_GROUP_LABELS: Record<AdminGroup, string> = {
  semantic: 'Dados',
  commercial: 'Comercial',
  tenants: 'Acesso',
  'ai-studio': 'AI Studio',
};
```

- [ ] **Step 4: Modificar AdminPage.tsx**

Adicionar imports e os blocos de seção (após a linha do `users`):

```typescript
import { AiAgentsTab } from '@/features/ai-studio/admin/ui/AiAgentsTab';
import { AiSkillsTab } from '@/features/ai-studio/admin/ui/AiSkillsTab';
import { KnowledgeBasesTab } from '@/features/ai-studio/admin/ui/KnowledgeBasesTab';
import { AiWorkflowsTab } from '@/features/ai-studio/admin/ui/AiWorkflowsTab';
import { ToolsCatalog } from '@/features/ai-studio/admin/ui/ToolsCatalog';
```

```tsx
          {section === 'ai-agents' && <AiAgentsTab />}
          {section === 'ai-skills' && <AiSkillsTab />}
          {section === 'ai-knowledge-bases' && <KnowledgeBasesTab />}
          {section === 'ai-workflows' && <AiWorkflowsTab />}
          {section === 'ai-tools' && <ToolsCatalog />}
```

> Os componentes Tab são criados nas Tasks 12–14. Para o nav-test passar agora, basta a modificação do `admin-nav.ts` (Step 3). A compilação completa do AdminPage só fecha após as Tasks 12–14 — por isso os imports/JSX entram aqui mas o `pnpm build` é validado no fim da Task 14.

- [ ] **Step 5: Rodar e ver passar (nav test)**

Run: `pnpm test src/features/admin/model/admin-nav.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/admin/model/admin-nav.ts src/features/admin/model/admin-nav.test.ts src/features/admin/ui/AdminPage.tsx
git commit -m "feat(ai-studio): grupo AI Studio no admin-nav + wiring do AdminPage"
```

---

### Task 12: UI genérica — hook + Tab + Table

**Files:**
- Create: `src/features/ai-studio/admin/model/useAiStudioCrud.ts`
- Create: `src/features/ai-studio/admin/ui/AiStudioTable.tsx`
- Create: `src/features/ai-studio/admin/ui/AiStudioListShell.tsx`

> UI presentational: o projeto não testa componentes em unidade (ver glob de `*.test.ts`). Validação por `pnpm build` + `pnpm lint` + smoke manual ao fim da Task 14. A lógica de dados já está coberta (Task 10).

**Interfaces:**
- Consumes: `makeAiStudioApi` (Task 10).
- Produces:
  - `useAiStudioCrud(path: EntityPath)` → `{ rows, loading, error, save, patch, remove, reset, refetch }` (toast em warnings, igual a `useAdminTemplates`).
  - `<AiStudioTable rows onEdit onDelete onReset>` — tabela com badge "Sistema", botão excluir oculto em system, botão "Restaurar padrão" em system.
  - `<AiStudioListShell title createLabel onCreate search ...>` — cabeçalho + busca + slot da tabela + form (children).

- [ ] **Step 1: Implementar o hook**

`src/features/ai-studio/admin/model/useAiStudioCrud.ts`:

```typescript
'use client';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { makeAiStudioApi, type EntityPath, type AiStudioRecordLike } from './api';

export function useAiStudioCrud(path: EntityPath) {
  const [api] = useState(() => makeAiStudioApi(path));
  const [rows, setRows] = useState<AiStudioRecordLike[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true); setError(null);
    try { setRows(await api.list()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Erro desconhecido'); }
    finally { setLoading(false); }
  }, [api]);

  const save = useCallback(async (record: { id: string } & Record<string, unknown>) => {
    const { warnings } = await api.save(record);
    if (warnings?.length) toast.warning('Salvo com avisos', { description: warnings.join('\n') });
    await refetch();
  }, [api, refetch]);

  const patch = useCallback(async (id: string, updates: Record<string, unknown>) => {
    await api.patch(id, updates); await refetch();
  }, [api, refetch]);

  const remove = useCallback(async (id: string) => { await api.remove(id); await refetch(); }, [api, refetch]);
  const reset = useCallback(async (id: string) => {
    await api.reset(id); toast.success('Restaurado ao padrão'); await refetch();
  }, [api, refetch]);

  useEffect(() => { refetch(); }, [refetch]);
  return { rows, loading, error, save, patch, remove, reset, refetch };
}
```

- [ ] **Step 2: Implementar a tabela**

`src/features/ai-studio/admin/ui/AiStudioTable.tsx`:

```tsx
'use client';
import { Pencil, Trash2, RotateCcw } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import type { AiStudioRecordLike } from '../model/api';

interface Props {
  rows: AiStudioRecordLike[];
  loading: boolean;
  onEdit: (row: AiStudioRecordLike) => void;
  onDelete: (row: AiStudioRecordLike) => void;
  onReset: (row: AiStudioRecordLike) => void;
}

export function AiStudioTable({ rows, loading, onEdit, onDelete, onReset }: Props) {
  if (loading) return <p className="text-sm text-muted-foreground">Carregando...</p>;
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Nenhum registro.</p>;
  return (
    <div className="rounded-lg border border-border divide-y divide-border">
      {rows.map((row) => {
        const isSystem = row.origin === 'system';
        return (
          <div key={row.id} className="flex items-center justify-between px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm truncate">{String(row.name ?? row.id)}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isSystem ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
                  {isSystem ? 'Sistema' : 'Custom'}
                </span>
                <span className="text-[10px] text-muted-foreground">{String(row.status ?? '')}</span>
              </div>
              <p className="text-xs text-muted-foreground truncate">{String(row.description ?? row.id)}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button size="sm" variant="ghost" onClick={() => onEdit(row)}><Pencil className="size-3.5" /></Button>
              {isSystem
                ? <Button size="sm" variant="ghost" title="Restaurar padrão" onClick={() => onReset(row)}><RotateCcw className="size-3.5" /></Button>
                : <Button size="sm" variant="ghost" title="Excluir" onClick={() => onDelete(row)}><Trash2 className="size-3.5 text-destructive" /></Button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Implementar o shell de lista**

`src/features/ai-studio/admin/ui/AiStudioListShell.tsx`:

```tsx
'use client';
import { type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';

interface Props {
  count: number; total: number; loading: boolean; error: string | null;
  createLabel: string; onCreate: () => void;
  search: string; onSearch: (v: string) => void;
  children: ReactNode;
}

export function AiStudioListShell({ count, total, loading, error, createLabel, onCreate, search, onSearch, children }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {loading ? 'Carregando...' : `${count} de ${total}`}
        </p>
        <Button size="sm" onClick={onCreate} className="bg-primary text-black hover:bg-primary/90 text-xs gap-1.5">
          <Plus className="size-3.5" /> {createLabel}
        </Button>
      </div>
      {error && <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</div>}
      <Input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Buscar por id ou nome..." className="max-w-md" />
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/features/ai-studio/admin/model/useAiStudioCrud.ts src/features/ai-studio/admin/ui/AiStudioTable.tsx src/features/ai-studio/admin/ui/AiStudioListShell.tsx
git commit -m "feat(ai-studio): hook CRUD genérico + tabela + shell de lista (UI)"
```

---

### Task 13: Forms + Tabs por entidade (Agent/Skill/Workflow)

**Files:**
- Create: `src/features/ai-studio/admin/ui/MultiRefSelect.tsx` (multi-select com aviso de ref órfã)
- Create: `src/features/ai-studio/admin/ui/AiAgentsTab.tsx`
- Create: `src/features/ai-studio/admin/ui/AiSkillsTab.tsx`
- Create: `src/features/ai-studio/admin/ui/AiWorkflowsTab.tsx`

> Validação por build/lint + smoke manual (Task 14).

**Interfaces:**
- Consumes: `useAiStudioCrud` (Task 12), `AiStudioTable`/`AiStudioListShell` (Task 12), `fetchTools` (Task 10), shadcn `Dialog`/`Input`/`Textarea`/`Select`.
- Produces: `<AiAgentsTab/>`, `<AiSkillsTab/>`, `<AiWorkflowsTab/>`.

- [ ] **Step 1: MultiRefSelect** (componente compartilhado de seleção de refs)

`src/features/ai-studio/admin/ui/MultiRefSelect.tsx`:

```tsx
'use client';
interface Option { id: string; label: string }
interface Props { label: string; options: Option[]; value: string[]; onChange: (v: string[]) => void }

export function MultiRefSelect({ label, options, value, onChange }: Props) {
  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  }
  const known = new Set(options.map((o) => o.id));
  const orphans = value.filter((v) => !known.has(v));
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium">{label}</label>
      <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto rounded-md border border-border p-2">
        {options.map((o) => (
          <button type="button" key={o.id} onClick={() => toggle(o.id)}
            className={`text-[11px] px-2 py-0.5 rounded-full border ${value.includes(o.id) ? 'bg-primary/15 text-primary border-primary/40' : 'border-border text-muted-foreground'}`}>
            {o.label}
          </button>
        ))}
      </div>
      {orphans.length > 0 && (
        <p className="text-[11px] text-amber-500">Refs órfãs (mantidas, mas inexistentes): {orphans.join(', ')}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: AiAgentsTab** (form completo de agente)

`src/features/ai-studio/admin/ui/AiAgentsTab.tsx`:

```tsx
'use client';
import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { Button } from '@/shared/ui/button';
import { ConfirmDialog } from '@/shared/ui/confirm-dialog';
import { useAiStudioCrud } from '../model/useAiStudioCrud';
import { makeAiStudioApi, fetchTools, type AiStudioRecordLike } from '../model/api';
import { AiStudioListShell } from './AiStudioListShell';
import { AiStudioTable } from './AiStudioTable';
import { MultiRefSelect } from './MultiRefSelect';

const MODELS = ['router', 'fast', 'slow', 'reasoning'] as const;
const skillsApi = makeAiStudioApi('skills');
const kbApi = makeAiStudioApi('kb');

interface Draft { id: string; name: string; description: string; instructions: string; model: string; status: string; kind?: string; origin?: string; skillRefs: string[]; toolRefs: string[]; knowledgeBaseRefs: string[] }
const EMPTY: Draft = { id: '', name: '', description: '', instructions: '', model: 'fast', status: 'active', skillRefs: [], toolRefs: [], knowledgeBaseRefs: [] };

export function AiAgentsTab() {
  const { rows, loading, error, save, patch, remove, reset } = useAiStudioCrud('agents');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [confirmDelete, setConfirmDelete] = useState<AiStudioRecordLike | null>(null);
  const [tools, setTools] = useState<{ id: string; label: string }[]>([]);
  const [skills, setSkills] = useState<{ id: string; label: string }[]>([]);
  const [kbs, setKbs] = useState<{ id: string; label: string }[]>([]);

  useEffect(() => {
    fetchTools().then((t) => setTools(t.map((x) => ({ id: x.key, label: x.name })))).catch(() => {});
    skillsApi.list().then((s) => setSkills(s.map((x) => ({ id: x.id, label: String(x.name ?? x.id) })))).catch(() => {});
    kbApi.list().then((k) => setKbs(k.map((x) => ({ id: x.id, label: String(x.name ?? x.id) })))).catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => r.id.toLowerCase().includes(q) || String(r.name ?? '').toLowerCase().includes(q)) : rows;
  }, [rows, search]);

  function openCreate() { setDraft(EMPTY); setOpen(true); }
  function openEdit(row: AiStudioRecordLike) {
    setDraft({
      id: row.id, name: String(row.name ?? ''), description: String(row.description ?? ''),
      instructions: String(row.instructions ?? ''), model: String(row.model ?? 'fast'),
      status: String(row.status ?? 'active'), kind: row.kind as string, origin: row.origin as string,
      skillRefs: (row.skillRefs as string[]) ?? [], toolRefs: (row.toolRefs as string[]) ?? [],
      knowledgeBaseRefs: (row.knowledgeBaseRefs as string[]) ?? [],
    });
    setOpen(true);
  }

  function slugify(v: string) { return v.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }

  async function handleSave() {
    const isSystem = draft.origin === 'system';
    const exists = rows.some((r) => r.id === draft.id);
    const payload = {
      name: draft.name, description: draft.description, instructions: draft.instructions,
      model: draft.model, status: draft.status, skillRefs: draft.skillRefs,
      toolRefs: draft.toolRefs, knowledgeBaseRefs: draft.knowledgeBaseRefs,
    };
    if (exists && isSystem) await patch(draft.id, payload);            // system: PATCH (campos travados barrados no server)
    else if (exists) await patch(draft.id, payload);
    else await save({ id: slugify(draft.id || draft.name), ...payload });
    setOpen(false);
  }

  const isSystem = draft.origin === 'system';
  return (
    <AiStudioListShell count={filtered.length} total={rows.length} loading={loading} error={error}
      createLabel="Novo agente" onCreate={openCreate} search={search} onSearch={setSearch}>
      <AiStudioTable rows={filtered} loading={loading} onEdit={openEdit}
        onDelete={(r) => setConfirmDelete(r)} onReset={(r) => reset(r.id)} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{draft.origin ? `Editar: ${draft.name}` : 'Novo agente'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {!draft.origin && <Input placeholder="id (slug, gerado do nome se vazio)" value={draft.id} onChange={(e) => setDraft({ ...draft, id: e.target.value })} />}
            <Input placeholder="Nome" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <Input placeholder="Descrição" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            <div>
              <label className="text-xs font-medium">Instruções (system prompt)</label>
              <Textarea rows={8} value={draft.instructions} onChange={(e) => setDraft({ ...draft, instructions: e.target.value })} />
            </div>
            <div className="flex gap-2 items-center">
              <label className="text-xs font-medium">Model</label>
              <select className="text-sm border border-border rounded-md bg-background px-2 py-1" value={draft.model}
                onChange={(e) => setDraft({ ...draft, model: e.target.value })}>
                {MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              {isSystem && <span className="text-[11px] text-muted-foreground">(kind travado: {draft.kind})</span>}
            </div>
            <MultiRefSelect label="Skills" options={skills} value={draft.skillRefs} onChange={(v) => setDraft({ ...draft, skillRefs: v })} />
            <MultiRefSelect label="Tools" options={tools} value={draft.toolRefs} onChange={(v) => setDraft({ ...draft, toolRefs: v })} />
            <MultiRefSelect label="Knowledge Bases" options={kbs} value={draft.knowledgeBaseRefs} onChange={(v) => setDraft({ ...draft, knowledgeBaseRefs: v })} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={confirmDelete !== null} onOpenChange={(o) => !o && setConfirmDelete(null)} destructive
        title="Excluir agente" description={confirmDelete ? `Excluir "${String(confirmDelete.name)}"? Ação irreversível.` : ''}
        confirmLabel="Excluir" onConfirm={async () => { if (confirmDelete) await remove(confirmDelete.id); }} />
    </AiStudioListShell>
  );
}
```

- [ ] **Step 3: AiSkillsTab** (form: name, description, playbook, toolRefs, kbRefs)

`src/features/ai-studio/admin/ui/AiSkillsTab.tsx` — mesma estrutura do AiAgentsTab, porém o draft tem `playbook` (Textarea grande) em vez de `instructions`/`model`/`kind`/`skillRefs`, e mantém `toolRefs`/`knowledgeBaseRefs`. Replicar o componente com:

```tsx
'use client';
import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { Button } from '@/shared/ui/button';
import { ConfirmDialog } from '@/shared/ui/confirm-dialog';
import { useAiStudioCrud } from '../model/useAiStudioCrud';
import { makeAiStudioApi, fetchTools, type AiStudioRecordLike } from '../model/api';
import { AiStudioListShell } from './AiStudioListShell';
import { AiStudioTable } from './AiStudioTable';
import { MultiRefSelect } from './MultiRefSelect';

const kbApi = makeAiStudioApi('kb');
interface Draft { id: string; name: string; description: string; playbook: string; status: string; origin?: string; toolRefs: string[]; knowledgeBaseRefs: string[] }
const EMPTY: Draft = { id: '', name: '', description: '', playbook: '', status: 'active', toolRefs: [], knowledgeBaseRefs: [] };
function slugify(v: string) { return v.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }

export function AiSkillsTab() {
  const { rows, loading, error, save, patch, remove, reset } = useAiStudioCrud('skills');
  const [search, setSearch] = useState(''); const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [confirmDelete, setConfirmDelete] = useState<AiStudioRecordLike | null>(null);
  const [tools, setTools] = useState<{ id: string; label: string }[]>([]);
  const [kbs, setKbs] = useState<{ id: string; label: string }[]>([]);

  useEffect(() => {
    fetchTools().then((t) => setTools(t.map((x) => ({ id: x.key, label: x.name })))).catch(() => {});
    kbApi.list().then((k) => setKbs(k.map((x) => ({ id: x.id, label: String(x.name ?? x.id) })))).catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => r.id.toLowerCase().includes(q) || String(r.name ?? '').toLowerCase().includes(q)) : rows;
  }, [rows, search]);

  function openEdit(row: AiStudioRecordLike) {
    setDraft({ id: row.id, name: String(row.name ?? ''), description: String(row.description ?? ''),
      playbook: String(row.playbook ?? ''), status: String(row.status ?? 'active'), origin: row.origin as string,
      toolRefs: (row.toolRefs as string[]) ?? [], knowledgeBaseRefs: (row.knowledgeBaseRefs as string[]) ?? [] });
    setOpen(true);
  }
  async function handleSave() {
    const exists = rows.some((r) => r.id === draft.id);
    const payload = { name: draft.name, description: draft.description, playbook: draft.playbook, status: draft.status, toolRefs: draft.toolRefs, knowledgeBaseRefs: draft.knowledgeBaseRefs };
    if (exists) await patch(draft.id, payload); else await save({ id: slugify(draft.id || draft.name), ...payload });
    setOpen(false);
  }

  return (
    <AiStudioListShell count={filtered.length} total={rows.length} loading={loading} error={error}
      createLabel="Nova skill" onCreate={() => { setDraft(EMPTY); setOpen(true); }} search={search} onSearch={setSearch}>
      <AiStudioTable rows={filtered} loading={loading} onEdit={openEdit} onDelete={(r) => setConfirmDelete(r)} onReset={(r) => reset(r.id)} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{draft.origin ? `Editar: ${draft.name}` : 'Nova skill'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {!draft.origin && <Input placeholder="id (slug)" value={draft.id} onChange={(e) => setDraft({ ...draft, id: e.target.value })} />}
            <Input placeholder="Nome" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <Input placeholder="Descrição (quando usar)" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            <div><label className="text-xs font-medium">Playbook</label>
              <Textarea rows={10} value={draft.playbook} onChange={(e) => setDraft({ ...draft, playbook: e.target.value })} /></div>
            <MultiRefSelect label="Tools" options={tools} value={draft.toolRefs} onChange={(v) => setDraft({ ...draft, toolRefs: v })} />
            <MultiRefSelect label="Knowledge Bases" options={kbs} value={draft.knowledgeBaseRefs} onChange={(v) => setDraft({ ...draft, knowledgeBaseRefs: v })} />
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={handleSave}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={confirmDelete !== null} onOpenChange={(o) => !o && setConfirmDelete(null)} destructive
        title="Excluir skill" description={confirmDelete ? `Excluir "${String(confirmDelete.name)}"?` : ''}
        confirmLabel="Excluir" onConfirm={async () => { if (confirmDelete) await remove(confirmDelete.id); }} />
    </AiStudioListShell>
  );
}
```

- [ ] **Step 4: AiWorkflowsTab** (form: name, description "quando usar", instruction, isDefault toggle)

`src/features/ai-studio/admin/ui/AiWorkflowsTab.tsx` — mesma estrutura; draft tem `instruction` (Textarea) e `isDefault` (checkbox):

```tsx
'use client';
import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { Button } from '@/shared/ui/button';
import { ConfirmDialog } from '@/shared/ui/confirm-dialog';
import { useAiStudioCrud } from '../model/useAiStudioCrud';
import { type AiStudioRecordLike } from '../model/api';
import { AiStudioListShell } from './AiStudioListShell';
import { AiStudioTable } from './AiStudioTable';

interface Draft { id: string; name: string; description: string; instruction: string; status: string; isDefault: boolean; origin?: string }
const EMPTY: Draft = { id: '', name: '', description: '', instruction: '', status: 'active', isDefault: false };
function slugify(v: string) { return v.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }

export function AiWorkflowsTab() {
  const { rows, loading, error, save, patch, remove, reset } = useAiStudioCrud('workflows');
  const [search, setSearch] = useState(''); const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [confirmDelete, setConfirmDelete] = useState<AiStudioRecordLike | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => r.id.toLowerCase().includes(q) || String(r.name ?? '').toLowerCase().includes(q)) : rows;
  }, [rows, search]);

  function openEdit(row: AiStudioRecordLike) {
    setDraft({ id: row.id, name: String(row.name ?? ''), description: String(row.description ?? ''),
      instruction: String(row.instruction ?? ''), status: String(row.status ?? 'active'),
      isDefault: Boolean(row.isDefault), origin: row.origin as string });
    setOpen(true);
  }
  async function handleSave() {
    const exists = rows.some((r) => r.id === draft.id);
    const payload = { name: draft.name, description: draft.description, instruction: draft.instruction, status: draft.status, isDefault: draft.isDefault };
    if (exists) await patch(draft.id, payload); else await save({ id: slugify(draft.id || draft.name), ...payload });
    setOpen(false);
  }

  return (
    <AiStudioListShell count={filtered.length} total={rows.length} loading={loading} error={error}
      createLabel="Novo workflow" onCreate={() => { setDraft(EMPTY); setOpen(true); }} search={search} onSearch={setSearch}>
      <AiStudioTable rows={filtered} loading={loading} onEdit={openEdit} onDelete={(r) => setConfirmDelete(r)} onReset={(r) => reset(r.id)} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{draft.origin ? `Editar: ${draft.name}` : 'Novo workflow'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {!draft.origin && <Input placeholder="id (slug)" value={draft.id} onChange={(e) => setDraft({ ...draft, id: e.target.value })} />}
            <Input placeholder="Nome" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <div><label className="text-xs font-medium">Quando usar (descrição p/ o roteador)</label>
              <Textarea rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
            <div><label className="text-xs font-medium">Instrução de orquestração</label>
              <Textarea rows={10} value={draft.instruction} onChange={(e) => setDraft({ ...draft, instruction: e.target.value })} /></div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.isDefault} onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })} />
              Workflow default (fallback do roteador)
            </label>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={handleSave}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={confirmDelete !== null} onOpenChange={(o) => !o && setConfirmDelete(null)} destructive
        title="Excluir workflow" description={confirmDelete ? `Excluir "${String(confirmDelete.name)}"?` : ''}
        confirmLabel="Excluir" onConfirm={async () => { if (confirmDelete) await remove(confirmDelete.id); }} />
    </AiStudioListShell>
  );
}
```

> Nota sobre `isDefault`: a invariante "exatamente 1 default" será reforçada no servidor numa fase posterior (Fase 4, quando o roteador entra). Na Fase 0, o toggle persiste o booleano; o seed já garante 1 default.

- [ ] **Step 5: Commit**

```bash
git add src/features/ai-studio/admin/ui/MultiRefSelect.tsx src/features/ai-studio/admin/ui/AiAgentsTab.tsx src/features/ai-studio/admin/ui/AiSkillsTab.tsx src/features/ai-studio/admin/ui/AiWorkflowsTab.tsx
git commit -m "feat(ai-studio): tabs/forms de Agentes, Skills e Workflows"
```

---

### Task 14: KnowledgeBasesTab + ToolsCatalog + build/lint/smoke

**Files:**
- Create: `src/features/ai-studio/admin/ui/KnowledgeBasesTab.tsx`
- Create: `src/features/ai-studio/admin/ui/ToolsCatalog.tsx`

> KB nesta fase = CRUD de metadados (sem upload de doc; upload é Fase 2). Validação final: build + lint + smoke manual.

**Interfaces:**
- Consumes: `useAiStudioCrud('kb')`, `fetchTools`, componentes da Task 12.
- Produces: `<KnowledgeBasesTab/>`, `<ToolsCatalog/>`.

- [ ] **Step 1: KnowledgeBasesTab** (form: name, description, clientId opcional, status)

`src/features/ai-studio/admin/ui/KnowledgeBasesTab.tsx`:

```tsx
'use client';
import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Button } from '@/shared/ui/button';
import { ConfirmDialog } from '@/shared/ui/confirm-dialog';
import { useAiStudioCrud } from '../model/useAiStudioCrud';
import { type AiStudioRecordLike } from '../model/api';
import { AiStudioListShell } from './AiStudioListShell';
import { AiStudioTable } from './AiStudioTable';

interface Draft { id: string; name: string; description: string; clientId: string; status: string; origin?: string }
const EMPTY: Draft = { id: '', name: '', description: '', clientId: '', status: 'active' };
function slugify(v: string) { return v.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }

export function KnowledgeBasesTab() {
  const { rows, loading, error, save, patch, remove, reset } = useAiStudioCrud('kb');
  const [search, setSearch] = useState(''); const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [confirmDelete, setConfirmDelete] = useState<AiStudioRecordLike | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => r.id.toLowerCase().includes(q) || String(r.name ?? '').toLowerCase().includes(q)) : rows;
  }, [rows, search]);

  function openEdit(row: AiStudioRecordLike) {
    setDraft({ id: row.id, name: String(row.name ?? ''), description: String(row.description ?? ''),
      clientId: row.clientId ? String(row.clientId) : '', status: String(row.status ?? 'active'), origin: row.origin as string });
    setOpen(true);
  }
  async function handleSave() {
    const exists = rows.some((r) => r.id === draft.id);
    // clientId é travado em system; em user, '' → global (null)
    const payload: Record<string, unknown> = { name: draft.name, description: draft.description, status: draft.status };
    if (!exists) payload.clientId = draft.clientId.trim() || null;
    if (exists) await patch(draft.id, payload); else await save({ id: slugify(draft.id || draft.name), ...payload });
    setOpen(false);
  }

  return (
    <AiStudioListShell count={filtered.length} total={rows.length} loading={loading} error={error}
      createLabel="Nova KB" onCreate={() => { setDraft(EMPTY); setOpen(true); }} search={search} onSearch={setSearch}>
      <AiStudioTable rows={filtered} loading={loading} onEdit={openEdit} onDelete={(r) => setConfirmDelete(r)} onReset={(r) => reset(r.id)} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{draft.origin ? `Editar: ${draft.name}` : 'Nova Knowledge Base'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {!draft.origin && <Input placeholder="id (slug)" value={draft.id} onChange={(e) => setDraft({ ...draft, id: e.target.value })} />}
            <Input placeholder="Nome" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <Input placeholder="Descrição" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            {!draft.origin && <Input placeholder="clientId (vazio = global)" value={draft.clientId} onChange={(e) => setDraft({ ...draft, clientId: e.target.value })} />}
            <p className="text-[11px] text-muted-foreground">Upload de documentos chega na Fase 2.</p>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={handleSave}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={confirmDelete !== null} onOpenChange={(o) => !o && setConfirmDelete(null)} destructive
        title="Excluir KB" description={confirmDelete ? `Excluir "${String(confirmDelete.name)}"?` : ''}
        confirmLabel="Excluir" onConfirm={async () => { if (confirmDelete) await remove(confirmDelete.id); }} />
    </AiStudioListShell>
  );
}
```

- [ ] **Step 2: ToolsCatalog** (read-only)

`src/features/ai-studio/admin/ui/ToolsCatalog.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { fetchTools } from '../model/api';
import type { ToolDescriptor } from '@/features/ai-studio/tools-manifest';

export function ToolsCatalog() {
  const [tools, setTools] = useState<ToolDescriptor[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { fetchTools().then(setTools).finally(() => setLoading(false)); }, []);
  if (loading) return <p className="text-sm text-muted-foreground">Carregando...</p>;
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{tools.length} tools (read-only — definidas em código).</p>
      <div className="rounded-lg border border-border divide-y divide-border">
        {tools.map((t) => (
          <div key={t.key} className="px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{t.name}</span>
              <code className="text-[11px] text-muted-foreground">{t.key}</code>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{t.category}</span>
            </div>
            <p className="text-xs text-muted-foreground">{t.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: sem erros nos arquivos novos (corrigir imports/unused se houver).

- [ ] **Step 4: Build (valida o wiring do AdminPage da Task 11)**

Run: `pnpm build`
Expected: build conclui sem erros de tipo/import.

- [ ] **Step 5: Smoke manual**

Run: `pnpm dev` e abrir `/admin?section=ai-tools` (lista as tools) e `/admin?section=ai-agents`.
Expected: grupo "AI Studio" no menu; abas carregam (vazias até rodar o seed na Task 15).

- [ ] **Step 6: Commit**

```bash
git add src/features/ai-studio/admin/ui/KnowledgeBasesTab.tsx src/features/ai-studio/admin/ui/ToolsCatalog.tsx
git commit -m "feat(ai-studio): KnowledgeBases tab + Tools catalog (read-only) + build verde"
```

---

### Task 15: Seed script + integração ponta-a-ponta (shadow)

**Files:**
- Create: `scripts/seed-ai-studio.ts`
- Modify: `package.json:scripts` (adicionar `"seed:ai-studio": "tsx scripts/seed-ai-studio.ts"`)

**Interfaces:**
- Consumes: `ensureSeed` (Task 7).

- [ ] **Step 1: Implementar o script**

`scripts/seed-ai-studio.ts`:

```typescript
import { ensureSeed } from '@/features/ai-studio/seed/ensure-seed';

async function main() {
  await ensureSeed();
  console.log('[seed:ai-studio] seeds de sistema garantidos (idempotente).');
}
main().catch((e) => { console.error(e); process.exit(1); });
```

> Se `tsx` não resolver o alias `@/`, usar caminho relativo `../src/features/ai-studio/seed/ensure-seed` (os scripts do repo usam `@/` em vários casos — checar `scripts/ingest-rag.ts`; replicar o padrão de import vigente).

- [ ] **Step 2: Adicionar o script no package.json**

Em `package.json`, no bloco `scripts`, adicionar:

```json
    "seed:ai-studio": "tsx scripts/seed-ai-studio.ts",
```

- [ ] **Step 3: Rodar o seed (ambiente dev com ADC)**

Run: `pnpm seed:ai-studio`
Expected: log de sucesso; coleções `aiAgents` (9 docs), `aiWorkflows` (1), `knowledgeBases` (1) criadas no Firestore.

> Atenção (memória do projeto): conferir que `GOOGLE_APPLICATION_CREDENTIALS` não está sobrescrevendo o ADC e quebrando o Firestore em dev antes de rodar.

- [ ] **Step 4: Smoke manual end-to-end**

Run: `pnpm dev`; em `/admin?section=ai-agents`:
- Os 9 agentes de sistema aparecem com badge "Sistema", sem botão excluir, com botão "Restaurar padrão".
- Editar `instructions` do `descriptive` → salvar → recarregar → persistiu.
- Tentar (via UI não há botão; via curl opcional) `DELETE /api/ai-studio/agents?id=descriptive` → 422.
- Criar um agente novo "teste-x" → aparece como "Custom", editável e deletável.
- Em `/admin?section=ai-workflows`: existe 1 workflow default.

- [ ] **Step 5: Rodar toda a suíte de testes do AI Studio**

Run: `pnpm test src/features/ai-studio app/api/ai-studio src/shared/schemas/ai-studio src/features/admin/model/admin-nav.test.ts`
Expected: tudo PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/seed-ai-studio.ts package.json
git commit -m "feat(ai-studio): script de seed idempotente + integração shadow ponta-a-ponta"
```

---

### Task 16: [Início Fase 1] Descriptive agent lê config em runtime (atrás de flag)

**Files:**
- Create: `src/features/ai-studio/runtime/config-loader.ts`
- Create: `src/features/ai-studio/runtime/resolve-agent.ts`
- Test: `src/features/ai-studio/runtime/resolve-agent.test.ts`
- Modify: `src/shared/stores/app-store.ts` (adicionar flag `useAiStudioAgents`, default `false`)
- Modify: factory Mastra do descriptive (`src/features/ai-agents/mastra/descriptive-agent-mastra.ts` — confirmar caminho exato) para usar `resolveAgentInstructions` quando a flag estiver on, com fallback ao builder atual.

**Interfaces:**
- Consumes: `AiStudioRepo`/coleção `aiAgents`; builders de prompt existentes (fallback).
- Produces:
  - `loadAgentConfig(systemKey: string): Promise<AiStudioRecord | null>` (cacheado por TTL curto).
  - `resolveAgentInstructions(input: { systemKey: string; fallback: string; flagOn: boolean }): Promise<string>` — retorna `instructions` do Firestore (+ playbooks das skills anexadas concatenados) quando `flagOn && doc existe`; senão retorna `fallback`.

- [ ] **Step 1: Teste (falhando)**

`src/features/ai-studio/runtime/resolve-agent.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { loadAgentConfigMock, loadSkillsMock } = vi.hoisted(() => ({
  loadAgentConfigMock: vi.fn(), loadSkillsMock: vi.fn(),
}));
vi.mock('./config-loader', () => ({
  loadAgentConfig: loadAgentConfigMock,
  loadSkillPlaybooks: loadSkillsMock,
}));

import { resolveAgentInstructions } from './resolve-agent';

beforeEach(() => { loadAgentConfigMock.mockReset(); loadSkillsMock.mockReset(); });

describe('resolveAgentInstructions', () => {
  it('flag off → usa fallback', async () => {
    const out = await resolveAgentInstructions({ systemKey: 'descriptive', fallback: 'CODE', flagOn: false });
    expect(out).toBe('CODE');
    expect(loadAgentConfigMock).not.toHaveBeenCalled();
  });

  it('flag on + doc ausente → fallback', async () => {
    loadAgentConfigMock.mockResolvedValueOnce(null);
    const out = await resolveAgentInstructions({ systemKey: 'descriptive', fallback: 'CODE', flagOn: true });
    expect(out).toBe('CODE');
  });

  it('flag on + doc presente → instructions + playbooks das skills', async () => {
    loadAgentConfigMock.mockResolvedValueOnce({ id: 'descriptive', instructions: 'FIRESTORE', skillRefs: ['safra'] });
    loadSkillsMock.mockResolvedValueOnce(['## Skill Safra\npasso a passo']);
    const out = await resolveAgentInstructions({ systemKey: 'descriptive', fallback: 'CODE', flagOn: true });
    expect(out).toContain('FIRESTORE');
    expect(out).toContain('Skill Safra');
    expect(out).not.toBe('CODE');
  });

  it('erro de leitura → fallback (fail-soft)', async () => {
    loadAgentConfigMock.mockRejectedValueOnce(new Error('firestore down'));
    const out = await resolveAgentInstructions({ systemKey: 'descriptive', fallback: 'CODE', flagOn: true });
    expect(out).toBe('CODE');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test src/features/ai-studio/runtime/resolve-agent.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar config-loader**

`src/features/ai-studio/runtime/config-loader.ts`:

```typescript
import { AiStudioRepo, type AiStudioRecord } from '../repo';

// cache simples por TTL (evita ler Firestore a cada request)
const TTL_MS = 30_000;
const cache = new Map<string, { at: number; value: AiStudioRecord | null }>();

/** Lê um agente de sistema pelo systemKey (== id do seed). */
export async function loadAgentConfig(systemKey: string): Promise<AiStudioRecord | null> {
  const hit = cache.get(systemKey);
  const now = Date.now();
  if (hit && now - hit.at < TTL_MS) return hit.value;
  const value = await new AiStudioRepo('agent').get(systemKey);
  cache.set(systemKey, { at: now, value });
  return value;
}

/** Resolve os playbooks (texto) das skills anexadas a um agente. */
export async function loadSkillPlaybooks(skillRefs: string[]): Promise<string[]> {
  if (!skillRefs?.length) return [];
  const repo = new AiStudioRepo('skill');
  const out: string[] = [];
  for (const ref of skillRefs) {
    const skill = await repo.get(ref);
    if (skill && typeof skill.playbook === 'string' && skill.playbook.trim()) {
      out.push(`## Skill: ${String(skill.name ?? ref)}\n${skill.playbook}`);
    }
  }
  return out;
}
```

> `Date.now()` é permitido em runtime de app (a restrição de `Date.now()` vale só para scripts de Workflow do harness, não para o código do produto).

- [ ] **Step 4: Implementar resolve-agent**

`src/features/ai-studio/runtime/resolve-agent.ts`:

```typescript
import { loadAgentConfig, loadSkillPlaybooks } from './config-loader';

export interface ResolveInput {
  systemKey: string;
  fallback: string;
  flagOn: boolean;
}

/**
 * Retorna a instrução final do agente. Data-driven quando a flag está ON e há
 * doc no Firestore; senão cai no fallback (builder de código). Fail-soft.
 */
export async function resolveAgentInstructions(input: ResolveInput): Promise<string> {
  if (!input.flagOn) return input.fallback;
  try {
    const cfg = await loadAgentConfig(input.systemKey);
    if (!cfg || typeof cfg.instructions !== 'string' || !cfg.instructions.trim()) {
      return input.fallback;
    }
    const playbooks = await loadSkillPlaybooks((cfg.skillRefs as string[]) ?? []);
    return [cfg.instructions, ...playbooks].join('\n\n');
  } catch {
    return input.fallback; // fail-soft: nunca derruba o chat
  }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm test src/features/ai-studio/runtime/resolve-agent.test.ts`
Expected: PASS.

- [ ] **Step 6: Adicionar a feature flag no app-store**

Em `src/shared/stores/app-store.ts`, localizar onde `useWorkflowOrchestrator` é declarado e adicionar, no mesmo padrão (state + setter, default `false`):

```typescript
  useAiStudioAgents: false,
  setUseAiStudioAgents: (v: boolean) => set({ useAiStudioAgents: v }),
```

(e adicionar `useAiStudioAgents: boolean; setUseAiStudioAgents: (v: boolean) => void;` na interface do store).

- [ ] **Step 7: Ligar o descriptive agent ao resolver (com fallback)**

No factory Mastra do descriptive (`src/features/ai-agents/mastra/descriptive-agent-mastra.ts` — confirmar nome via busca; é o arquivo que chama `buildDescriptiveAgentPrompt()`), substituir a montagem direta das instructions por:

```typescript
import { resolveAgentInstructions } from '@/features/ai-studio/runtime/resolve-agent';
// ... onde hoje: const instructions = buildDescriptiveAgentPrompt(ctx)
const fallback = buildDescriptiveAgentPrompt(ctx);
const instructions = await resolveAgentInstructions({
  systemKey: 'descriptive',
  fallback,
  flagOn: /* ler a flag do contexto/store no server; se não houver store no server, usar env */ process.env.AI_STUDIO_AGENTS === 'on',
});
```

> Decisão de leitura da flag no server: como o `app-store` (Zustand) é client-side, no server use uma env (`AI_STUDIO_AGENTS=on`) OU propague a flag no corpo da request do `/api/chat`. Escolher a env para a Fase 1 (rollout controlado por deploy/secret), e documentar. O toggle no `app-store` fica para um painel de flags client-side em fase posterior.

- [ ] **Step 8: Verificar fallback (flag off) — não-regressão**

Run: `pnpm test src/features/ai-agents/agents/descriptive-agent.test.ts`
Expected: PASS (comportamento inalterado com a flag off).

- [ ] **Step 9: Build**

Run: `pnpm build`
Expected: sem erros.

- [ ] **Step 10: Commit**

```bash
git add src/features/ai-studio/runtime src/shared/stores/app-store.ts src/features/ai-agents/mastra/descriptive-agent-mastra.ts
git commit -m "feat(ai-studio): Fase 1 — descriptive agent lê instruções do Firestore atrás de flag (fallback ao código)"
```

---

## Self-Review

**Spec coverage:**
- Módulo AI Studio (5 seções) → Tasks 11–14. ✅
- Princípio "tudo é instrução" + schemas → Task 2. ✅
- Coleções Firestore + envelope → Tasks 2, 5, 6. ✅
- Proteção (origin/travados/reset) → Tasks 4, 6, 8. ✅
- Seeds de sistema (8 agentes + supervisor + workflow/KB default) → Task 7, 15. ✅
- Tool registry read-only → Tasks 3, 9, 14. ✅
- API `/api/ai-studio/*` + auth + soft-refs → Tasks 8, 9. ✅
- UX (Tab/Form/Table, badge Sistema, reset, busca) → Tasks 12–14. ✅
- Integração runtime live/faseada (Fase 1, descriptive, flag, fallback) → Task 16. ✅
- ADR-0016 → Task 1. ✅
- Migração `embeddingsDocs` → KB default; ingestão de KB; roteador de workflow; skills no runtime → **fora deste plano** (Fases 2–4, planos próprios). Registrado abaixo.

**Gaps conhecidos (intencionais, próximos planos):**
- **Fase 2:** upload/ingestão de docs (`/api/ai-studio/kb/[id]/docs`), `vector-query` com filtro `knowledgeBaseIds`, migração de `embeddingsDocs` legados, flag `useAiStudioKb`.
- **Fase 3:** skills no runtime de mais agentes além do descriptive, flag `useAiStudioSkills`.
- **Fase 4:** roteador de workflow (`select-workflow`) + execução da instrução no `/api/chat`, invariante "1 default" reforçada no server, flag `useAiStudioWorkflows`.

**Placeholder scan:** Nenhum "TBD/TODO". Há 2 pontos de "confirmar caminho exato" (factory Mastra do descriptive, padrão de import em scripts) — são confirmações de path no codebase, não placeholders de conteúdo; o passo descreve como confirmar.

**Type consistency:** `AiEntityType` declarado em `protection.ts` e reexportado por `entity-config.ts` (Tasks 4/5 consistentes). `AiStudioRecord`/`UpsertResult` (Task 6) usados por route-factory (Task 8) e config-loader (Task 16). `EntityPath` (Task 10) usado por hook/tabs (Tasks 12–14). `makeAiStudioRoutes` (Task 8) consumido por rotas (Task 9). Nomes batem.

---

## Execution Notes

- Ordem de dependência: 1 (ADR, independente) → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16.
- Tasks 2–10 são puramente TDD (logic/API); 11 mistura TDD (nav) + wiring; 12–14 são UI (build/lint/smoke); 15 integração; 16 início da Fase 1.
- Cada task termina commitada e com sua verificação executada.
