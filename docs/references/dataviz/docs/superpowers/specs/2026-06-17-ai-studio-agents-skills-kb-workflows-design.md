# AI Studio — Agents, Skills, Knowledge Bases & Workflows

**Date:** 2026-06-17
**Status:** Draft
**PR:** [#10 — feat(ai-studio): Fase 0 + início Fase 1](https://github.com/liquidpass/liquid-dataviz/pull/10)
**Plano:** `docs/superpowers/plans/2026-06-17-ai-studio-foundation.md`
**Relacionado:** ADR-0014 (Mastra runtime full), ADR-0013 (Firestore storage), ADR-0003 (mini state-machine — Canvas, **inalterada**), ADR-0006 (multi-tenancy), ADR-0008 (phase-based tool gating), ADR-0011 (semantic recall TTL/PII), ADR-0005 (embedding Vertex). **Gera nova ADR-0016** (AI Studio — config data-driven).

## Goal

Trazer **Agents, Skills, Knowledge Bases e Workflows** para a administração do DataViz como **CRUD**, de modo que a configuração da IA — hoje hardcoded em código — passe a ser **gerenciável em runtime** por um administrador, sem deploy.

O administrador poderá:

- **Editar a instrução de um agente** e **criar agentes novos**.
- **Criar/editar Skills** — playbooks reutilizáveis (texto procedural) que declaram quais tools e KBs usam, anexáveis a vários agentes.
- **Subir documentos** de conhecimento de mercado/produto/negócio numa **Knowledge Base** nomeada, com RAG escopado.
- **Definir Workflows** — uma instrução em prosa que diz, ao receber um comando, o que deve ser feito (qual agente/skill/tool usar e em que ordem).

Registros **de sistema** (os que já existem em código) **não podem ser deletados**, mas têm edição **granular** (alguns campos travados) e botão **Restaurar padrão**. Registros **criados pelo usuário** são totalmente editáveis e deletáveis.

A integração com o runtime é **live, porém faseada**: a config vai para o Firestore e o runtime Mastra passa a lê-la, mas o wiring é incremental, atrás de feature flags, com **fallback** para o comportamento atual em código (zero regressão).

## Problem

Hoje, a inteligência do produto vive em **código**:

1. **Agentes são código.** Os 8 sub-agentes (`descriptive`, `diagnostic`, `predictive`, `prescriptive`, `monitoring`, `simulation`, `external`, `cashflow`) estão em `src/features/ai-agents/agents/*.ts`; suas instruções vêm de *builders de prompt* (`src/shared/config/agents/buildDescriptiveAgentPrompt()` etc.). Mudar uma instrução exige PR + deploy.
2. **Não existe conceito de "Skill".** O análogo mais próximo são as ~70 **tools** em `src/features/ai-agents/tools/` (capacidades atômicas de código). Não há um meio de empacotar conhecimento procedural reutilizável.
3. **A Knowledge Base existe mas é alimentada por scripts.** `scripts/ingest-rag.ts` grava em `embeddingsDocs` (Firestore + cosine brute-force). Não há upload pela UI nem organização em bases nomeadas.
4. **Workflows existem só como código.** A mini state-machine determinística do Canvas (ADR-0003: `plan→gather→layout→fill→validate→render`) é poderosa, mas não é editável pelo administrador e não é o tipo de "fluxo de comando" que o pedido descreve.

Consequência: ajustar comportamento, conhecimento ou orquestração da IA depende de engenharia. O pedido é trazer essas quatro camadas para uma superfície de gestão (CRUD na admin) que **valha de verdade** no runtime.

## Conceitos (para evitar ambiguidade)

| Conceito | O que é | Storage hoje | Storage após esta spec |
|---|---|---|---|
| **Tool** | Capacidade atômica de código (executar SQL, BQML, gerar PDF…) | Código (`src/features/ai-agents/tools/`) | — (continua em código; exposta como catálogo read-only) |
| **Skill** | Playbook reutilizável em **texto** + tools/KBs que usa | — (não existe) | **Firestore `aiSkills` (global)** |
| **Agent** | Persona = instrução base + model + skills/tools/KBs anexadas | Código (builders de prompt) | **Firestore `aiAgents` (global)** |
| **Workflow** | Instrução de **orquestração** em prosa + "quando usar" | — (só state-machine de código) | **Firestore `aiWorkflows` (global)** |
| **Knowledge Base** | Base **nomeada** de documentos, com RAG escopado | `embeddingsDocs` (pool único, via script) | **Firestore `knowledgeBases` + `knowledgeBaseDocs`; chunks em `embeddingsDocs` taggeados** |

> A pipeline determinística do Canvas (ADR-0003) **não é tocada** por esta spec. "Workflow" aqui é uma camada de **diretriz de orquestração para o supervisor Mastra**, não a state-machine de construção de dashboards.

## Decisões (do brainstorming)

1. **Integração runtime:** live, **faseada**, atrás de feature flag, com fallback ao código.
2. **Skill = playbook reutilizável** (texto) que declara `toolRefs` + `knowledgeBaseRefs`; anexável a vários agentes.
3. **Workflow = instrução em prosa**, interpretada pelo supervisor Mastra; cita agentes/skills/tools pelo nome.
4. **Seleção de workflow = descrição + roteador:** cada workflow tem um campo "quando usar"; um agente roteador casa o comando ao melhor workflow; há **1 workflow default** de fallback.
5. **KB = bases nomeadas + RAG escopado:** agentes/skills declaram quais KBs podem consultar; o retrieval busca só nas KBs referenciadas (+ globais + cliente ativo).
6. **Proteção:** `origin: system|user` + campos travados (política em código) + **Restaurar padrão**. Sistema nunca deletável; usuário totalmente livre.
7. **Tenancy:** Agents/Skills/Workflows **globais**; KBs globais **ou** escopadas por `clientId`.

## Princípio unificador

Tudo é **instrução que dirige o runtime LLM**, coerente com Mastra (ADR-0014):

```
Agente   = instrução base (system prompt) + capacidades anexadas
Skill    = instrução procedural (playbook) reutilizável
Workflow = instrução de orquestração que o supervisor interpreta
Tool     = capacidade atômica (código) — referenciada, não editada
```

## Modelo proposto

```
Código (builders de prompt, agents/*.ts)  →  fonte de TIPOS + seed (fallback quando flag off)
Firestore  aiAgents/{slug}                →  fonte canônica em runtime (NOVO, atrás de flag)
Firestore  aiSkills/{slug}                →  playbooks reutilizáveis (NOVO)
Firestore  aiWorkflows/{slug}             →  diretrizes de orquestração (NOVO)
Firestore  knowledgeBases/{slug}          →  bases nomeadas (NOVO)
Firestore  knowledgeBaseDocs/{id}         →  metadados dos docs-fonte (NOVO)
Firestore  embeddingsDocs (existente)     →  chunks, agora taggeados {knowledgeBaseId, sourceDocId}
Código (manifest de tools)                →  catálogo read-only de tools p/ os seletores
```

Admin: novo grupo **AI Studio** com 5 seções (Agentes, Skills, Knowledge Bases, Workflows, Tools[read-only]).

## Data Model

Convenções seguem o resto da admin: **doc id = slug kebab-case**, `serverTimestamp()` em `createdAt`/`updatedAt`, **soft-refs + warning** (refs órfãs não bloqueiam — viram aviso; consistente com o padrão `productRefs`/`metricRefs`).

### Envelope comum (`src/shared/schemas/ai-studio/common.ts`)

```typescript
import { z } from 'zod';

export const AiSlug = z.string().regex(/^[a-z][a-z0-9-]*$/, {
  message: 'Slug deve ser kebab-case (ex: "analise-inadimplencia")',
});

export const AiStatus = z.enum(['active', 'draft', 'archived']);
export const AiOrigin = z.enum(['system', 'user']);

// Campos comuns a todas as 4 entidades
export const AiEnvelope = z.object({
  id: AiSlug,
  name: z.string().min(1),
  description: z.string().default(''),     // p/ Workflow, é o "quando usar" (lido pelo roteador)
  status: AiStatus.default('active'),
  origin: AiOrigin.default('user'),
  systemKey: z.string().optional(),        // liga registro de sistema ao seed do código
  // gerenciados pelo servidor: createdAt, updatedAt, updatedBy
});
```

### `aiAgents/{slug}` (`src/shared/schemas/ai-studio/agent.ts`)

```typescript
export const ModelTier = z.enum(['router', 'fast', 'slow', 'reasoning']); // chaves do model-registry
export const AgentKind = z.enum(['worker', 'orchestrator']); // supervisor = orchestrator

export const AiAgentSchema = AiEnvelope.extend({
  kind: AgentKind.default('worker'),       // travado em system; identifica o supervisor
  instructions: z.string().default(''),    // system prompt (editável mesmo em system)
  model: ModelTier.default('fast'),
  skillRefs: z.array(AiSlug).default([]),         // → aiSkills           (soft ref + warning)
  toolRefs: z.array(z.string()).default([]),      // → tool registry keys (soft ref + warning)
  knowledgeBaseRefs: z.array(AiSlug).default([]), // → knowledgeBases     (soft ref + warning)
});
```

### `aiSkills/{slug}` (`src/shared/schemas/ai-studio/skill.ts`)

```typescript
export const AiSkillSchema = AiEnvelope.extend({
  playbook: z.string().default(''),               // texto procedural (markdown)
  toolRefs: z.array(z.string()).default([]),      // tools que a skill usa  (soft ref + warning)
  knowledgeBaseRefs: z.array(AiSlug).default([]), // KBs que a skill consulta (soft ref + warning)
});
```

### `aiWorkflows/{slug}` (`src/shared/schemas/ai-studio/workflow.ts`)

```typescript
export const AiWorkflowSchema = AiEnvelope.extend({
  instruction: z.string().default(''),  // prosa de orquestração (cita agentes/skills/tools)
  isDefault: z.boolean().default(false),// exatamente 1 workflow default (fallback do roteador)
  // description (do envelope) = o "quando usar" lido pelo roteador
});
```

Invariante: **exatamente um** workflow `active` com `isDefault: true`. A API garante (ao marcar um como default, desmarca os demais; o default de sistema não pode ser desmarcado sem promover outro).

### `knowledgeBases/{slug}` (`src/shared/schemas/ai-studio/knowledge-base.ts`)

```typescript
export const KnowledgeBaseSchema = AiEnvelope.extend({
  clientId: z.string().nullable().default(null),  // null = global; senão escopada ao cliente
  embeddingModel: z.string().default('gemini-embedding-001'),
  docCount: z.number().int().default(0),    // contadores denormalizados (mantidos pelo servidor)
  chunkCount: z.number().int().default(0),
});
```

### `knowledgeBaseDocs/{id}` (`src/shared/schemas/ai-studio/knowledge-base-doc.ts`)

`id` = auto (uuid). Metadados do documento-fonte; os chunks vão para `embeddingsDocs`.

```typescript
export const KbDocStatus = z.enum(['pending', 'processing', 'ready', 'error']);

export const KnowledgeBaseDocSchema = z.object({
  id: z.string(),
  knowledgeBaseId: AiSlug,
  filename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  status: KbDocStatus.default('pending'),
  chunkCount: z.number().int().default(0),
  error: z.string().optional(),
  uploadedBy: z.string().optional(),
  // createdAt, updatedAt (server)
});
```

### Extensão de `embeddingsDocs` (existente)

Chunks ganham dois campos opcionais (retrocompatível):

```
knowledgeBaseId?: string   // a qual KB o chunk pertence
sourceDocId?: string       // qual knowledgeBaseDocs originou o chunk
```

O `vector-query` passa a aceitar filtro `knowledgeBaseIds: string[]` (além do `clientId` já existente). Chunks legados sem `knowledgeBaseId` são absorvidos pela KB seed **`default`** (migração — ver §Migração).

### Tool registry (read-only, derivado de código)

Não é coleção CRUD. Um **manifest** em código (`src/features/ai-studio/tools-manifest.ts`) lista as tools disponíveis para os seletores e validação de `toolRefs`:

```typescript
export interface ToolDescriptor {
  key: string;            // ex: 'execute_sql'
  name: string;           // ex: 'Executar SQL'
  description: string;
  category: 'data' | 'stats' | 'bqml' | 'canvas' | 'export' | 'memory' | 'rag' | 'external';
}
```

Exposto via `GET /api/ai-studio/tools` (read-only). Fonte: enumerar as factories em `src/features/ai-agents/tools/` (manifest mantido junto às tools).

## Proteção: sistema vs usuário

- **Política por tipo, em código** (`src/features/ai-studio/protection.ts`): para cada entidade, o conjunto de **campos travados** quando `origin === 'system'`.

  | Entidade | Travado (system) | Editável (system) |
  |---|---|---|
  | Agent | `id`, `systemKey`, `kind` | `instructions`, `description`, `model`, `skillRefs`, `toolRefs`, `knowledgeBaseRefs`, `status` |
  | Skill | `id`, `systemKey` | `playbook`, `description`, `toolRefs`, `knowledgeBaseRefs`, `status` |
  | Workflow | `id`, `systemKey` | `instruction`, `description`, `isDefault`*, `status` |
  | KB | `id`, `systemKey`, `clientId` | `name`, `description`, `status`, docs |

  *Não é permitido desmarcar o default sem promover outro workflow.

- **DELETE:** API rejeita (`422`) se `origin === 'system'`.
- **PATCH:** API ignora/rejeita (`422`) mudanças em campos travados de registros de sistema.
- **Restaurar padrão:** `POST /api/ai-studio/<tipo>/<id>:reset` re-semeia o registro a partir do **seed manifest** do código (`src/features/ai-studio/seed/manifest.ts`). Disponível só para `origin === 'system'`.
- **UI:** registros de sistema mostram badge **"Sistema"**; campos travados aparecem `disabled`; botão **Restaurar padrão**; sem botão de excluir.

## Seeds de sistema (`src/features/ai-studio/seed/manifest.ts`)

- **8 agentes** (`descriptive`, `diagnostic`, `predictive`, `prescriptive`, `monitoring`, `simulation`, `external`, `cashflow`) + o **supervisor/orquestrador** (system agent `kind=orchestrator`), com `instructions` extraídas dos builders atuais e `systemKey` = a chave atual.
- **1 workflow default** (`default`) com instrução de orquestração equivalente ao comportamento de supervisor atual; `isDefault: true`, `origin: system`.
- **1 KB seed** (`default`) que absorve os `embeddingsDocs` legados.
- Skills de sistema: **nenhuma obrigatória** no MVP (o conhecimento procedural atual está embutido nos prompts); seeds de skill podem ser extraídas depois.

Seed é **idempotente** (upsert por `id`; só cria `createdAt` se não existe) e roda via script (`scripts/seed-ai-studio.ts`) + na primeira leitura do config loader (lazy ensure).

## Integração com o runtime (live, faseada)

Novo módulo `src/features/ai-studio/runtime/`:

```
config-loader.ts    // lê aiAgents/aiSkills/aiWorkflows/KB do Firestore (cache TTL, padrão dos configs)
resolve-agent.ts    // compõe a instrução final de um agente
select-workflow.ts  // roteador: comando → workflow
```

**Composição da instrução do agente** (`resolve-agent.ts`):

```
instrução final = agent.instructions
                + playbooks das skills anexadas (skillRefs → aiSkills.playbook)
                + tool set: toolRefs → tools de código reais (via tools-manifest)
                + tool de retrieval RAG vinculada às KBs do agente
                  (knowledgeBaseRefs ∪ KBs globais ∪ KBs do cliente ativo)
```

O factory do Mastra Agent (`src/features/ai-agents/mastra/`) passa a **ler esse config**. **Fallback:** se a flag está off, o doc não existe, ou a leitura falha → usa os builders de código atuais. Sem regressão.

**Seleção de workflow** (`select-workflow.ts`), em `/api/chat`:

```
1. lista workflows active (id + description "quando usar")
2. agente roteador (model 'router') classifica o comando → escolhe o melhor workflow (ou o isDefault)
3. roda o supervisor Mastra com workflow.instruction como diretriz de orquestração
4. supervisor tem os agentes disponíveis como tools e segue a instrução
```

**Tool gating (ADR-0008):** as fases existentes continuam valendo; `toolRefs` do agente **restringem** (interseção) o conjunto de tools já permitido pela fase — nunca ampliam além do que a fase autoriza.

**Feature flags** (em `app-store`, como `useWorkflowOrchestrator`): `useAiStudioAgents`, `useAiStudioKb`, `useAiStudioSkills`, `useAiStudioWorkflows`. Uma por fase; rollback instantâneo.

## Pipeline de ingestão da KB

```
upload (UI) → POST /api/ai-studio/kb/{id}/docs  (multipart)
  → cria knowledgeBaseDocs{status:'pending'}
  → ingestão assíncrona:
       extrai texto → chunker (src/shared/lib/rag/chunker.ts)
       → PII scrubber (src/shared/lib/rag/pii-scrubber.ts)
       → embed (Vertex gemini-embedding-001, src/shared/lib/rag/embeddings.ts)
       → upsert embeddingsDocs{knowledgeBaseId, sourceDocId, ...}
  → atualiza knowledgeBaseDocs{status:'ready', chunkCount} + contadores da KB
```

- **Formatos MVP:** `.md`, `.txt`, `.pdf` (extração de texto; PDF via lib já presente).
- **Reprocessar/excluir doc:** remove os chunks correspondentes em `embeddingsDocs` (filtro `sourceDocId`) e atualiza contadores.
- **Escopo no retrieval:** `vector-query` filtra `knowledgeBaseId ∈ refs` **e** `clientId ∈ {null(global), clienteAtivo}` — reaproveitando o filtro multi-tenant já existente em `vector-search.ts`.

## API (`/api/ai-studio/*`)

Todas as rotas usam `requireAdmin(req)` (claim `role=admin` ou e-mail `@askliquid.com`), padrão da admin. Padrão de CRUD igual a `dashboard-templates` (POST = upsert; PATCH = campos; DELETE por `?id=`).

| Rota | Métodos |
|---|---|
| `/api/ai-studio/agents` | GET (lista/`?id=`), POST (upsert), PATCH, DELETE |
| `/api/ai-studio/agents/[id]:reset` | POST (restaurar padrão — só system) |
| `/api/ai-studio/skills` | GET, POST, PATCH, DELETE, `:reset` |
| `/api/ai-studio/workflows` | GET, POST, PATCH, DELETE, `:reset` |
| `/api/ai-studio/kb` | GET, POST, PATCH, DELETE, `:reset` |
| `/api/ai-studio/kb/[id]/docs` | GET (lista), POST (upload), DELETE (`?docId=`) |
| `/api/ai-studio/tools` | GET (read-only, do manifest) |

Validação de refs: **soft + warning** (refs órfãs retornam aviso no 200, como `productRefs`). DELETE/PATCH respeitam a política de proteção (§Proteção).

## UX da admin

Novo grupo **AI Studio** em `src/features/admin/model/admin-nav.ts`. Cada seção segue o trio do projeto (`useAdminTemplates` / `TemplatesTab` / `TemplateForm` / `TemplatesTable`):

```
src/features/ai-studio/admin/
  model/  useAdminAiAgents.ts, useAdminAiSkills.ts, useAdminAiWorkflows.ts, useAdminKnowledgeBases.ts, useAiTools.ts
  ui/     AiAgentsTab/Form/Table, AiSkillsTab/Form/Table, AiWorkflowsTab/Form/Table,
          KnowledgeBasesTab/Form/Table + KbDocUploader, ToolsCatalog (read-only)
```

- **Lista:** badge "Sistema" vs "Custom"; busca; filtro por status.
- **Form:** campos do envelope + específicos; editor de texto grande para `instructions`/`playbook`/`instruction`; multi-select de skills/tools/KBs com aviso de ref órfã; campos travados `disabled` + **Restaurar padrão** em system.
- **KB:** form + **uploader** (drag-drop) + lista de docs com status (pending/processing/ready/error) e ação de excluir/reprocessar.
- **Tools:** tabela **read-only** (key, nome, descrição, categoria).

## Faseamento

Cada fase = seu próprio ciclo spec→plan→implementação. **Esta spec cobre a plataforma inteira**; o plano inicial detalha **Fase 0 + começo da Fase 1**.

| Fase | Entrega | Flag |
|---|---|---|
| **0 — Fundação** | Schemas Zod + coleções + repos Firestore + seed manifest (idempotente) + APIs CRUD + admin shell (5 tabs) + proteção/reset + tool registry read-only + **ADR-0016**. Tudo **shadow** (não afeta runtime). | — |
| **1 — Agentes live** | Factory Mastra lê `aiAgents` do Firestore; começa pelo **descriptive** (já em Mastra); fallback ao builder de código. | `useAiStudioAgents` |
| **2 — Knowledge Bases** | Upload/ingestão + RAG escopado por `knowledgeBaseRefs` + cliente. Migra `embeddingsDocs` legados p/ KB `default`. | `useAiStudioKb` |
| **3 — Skills** | Playbooks resolvidos na instrução do agente em runtime. | `useAiStudioSkills` |
| **4 — Workflows** | Roteador (descrição) + execução da instrução de orquestração no `/api/chat`. | `useAiStudioWorkflows` |

## Migração

- **`embeddingsDocs` legados:** script `scripts/migrate-embeddings-to-kb.ts` marca chunks sem `knowledgeBaseId` com `knowledgeBaseId='default'`. KB `default` é seed de sistema (`origin: system`). Retrocompatível: até a Fase 2, `vector-query` sem filtro de KB se comporta como hoje.
- **Builders de prompt:** permanecem no código como fonte de **fallback** e de **seed**. Não são removidos nesta entrega (removê-los é decisão de uma fase futura, quando o data-driven estiver consolidado).

## Error handling

- **Refs órfãs (soft):** `skillRefs`/`toolRefs`/`knowledgeBaseRefs`/agentes citados em workflow inexistentes → **warning** no response (não bloqueia salvar). Consistente com `productRefs`. *(Apenas `resolveColumn`/dados é fail-loud — não se aplica aqui.)*
- **Proteção (fail-loud):** DELETE de system ou PATCH em campo travado → `422` com mensagem clara.
- **Runtime fallback (fail-soft):** falha ao ler config do Firestore, flag off, ou doc ausente → usa builder de código. Logado, nunca derruba o chat.
- **Ingestão KB:** falha de extração/embed → doc fica `status:'error'` com `error`; demais docs da KB seguem.
- **Workflow default ausente:** se nenhum workflow casar e não houver default → supervisor roda com comportamento de código (fallback).

## Testing

- **Schemas:** unit (Zod) — defaults, slug inválido, enums.
- **Proteção:** unit — DELETE system bloqueado; PATCH em campo travado bloqueado; reset re-semeia; user livre.
- **Soft-refs:** unit — ref órfã vira warning, não erro.
- **Seed idempotente:** rodar 2× não duplica nem sobrescreve `createdAt`.
- **resolve-agent:** unit — composição instruction+playbooks+tools+KB; fallback quando flag off / doc ausente.
- **select-workflow:** unit — casa por descrição; cai no default; default ausente → fallback.
- **Ingestão KB:** integração — upload → chunks em `embeddingsDocs` com tags corretas; excluir doc remove chunks; retrieval escopado.
- **Não-regressão:** com todas as flags off, `/api/chat` e `/api/canvas-chat` se comportam exatamente como hoje.

## Out of scope (YAGNI)

- **Editor de grafo de workflow** — workflow é prosa, não grafo.
- **Skills compostas de skills** — descartado no brainstorming (skill é playbook + tools/KBs).
- **Tools editáveis pela UI** — tools continuam em código (catálogo read-only).
- **Camada de override/versionamento** dos registros de sistema — escolhido o modelo origin+travado+reset.
- **Tocar a state-machine do Canvas (ADR-0003)** — fora de escopo; coexiste.
- **Remover os builders de prompt do código** — ficam como fallback/seed.
- **Reescrever os `block`/`layout` schemas** — não há interseção.
- **Per-client agents/skills/workflows** — só KB tem escopo por cliente.

## Open questions

- Formato de **PDF** com tabelas/imagens: extração só de texto no MVP (OCR/tabelas ficam fora).
- **Limite de tamanho/cota** por KB e por upload — definir na Fase 2 (default conservador inicial).
- **Auditoria** (quem editou o quê) além de `updatedBy` — possível trilha futura.
