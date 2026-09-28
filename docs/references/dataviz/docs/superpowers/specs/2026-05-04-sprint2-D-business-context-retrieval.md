# Sprint 2.D — `retrieve_business_context`, Persona+Cliente Templates & Cross-Tenant Hard Isolation

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. TDD obrigatório (`superpowers:test-driven-development`); validar com `superpowers:verification-before-completion` antes de declarar tarefa pronta.

**Goal:** Construir o pipeline pré-geração `retrieve_business_context` que mescla **perfis estáticos** (cliente/persona/ICP/macro/glossário do Sprint 1.D) com **retrieval RAG dinâmico** (Sprint 2.A) sobre os 31 docs de `docs/benchmarking/`, expor como tool aos orchestrators, entregar **6 templates persona+cliente** para o layout-agent, e garantir **isolamento multi-tenant hard** com gate adversarial. Saída tipada Zod consumida por `buildAgentSystem` (Sprint 1.D) em todo agente do Dashboard Builder.

**Architecture:** Orquestração funcional pura em `src/features/business-context/` (sem stateful service, sem Mastra `new Agent()` — ADR-0002 Mastra-as-lib: a função pura é consumida via `streamText` no route handler). Pipeline:
1. Receber `(clientId, personaId, icpId, briefing, signal)` como parâmetros explícitos do route handler (não via `requestContext` Mastra).
2. Carregar perfis estáticos via `loadBusinessContext` (Sprint 1.D, in-memory ~1ms).
3. Mapear persona → temas de busca (`retrievePersonaThemes`).
4. **Em paralelo**: `vector_query` (Sprint 2.A) com filtros `{clientId, themes, productType, regulatoryArea}` (3-5 chunks); `getMacroSnapshot()` (Sprint 1.D, cache 1h).
5. Mesclar com working memory da sessão (Sprint 1.A) — **PII scrubbed**.
6. Compor `BusinessContext` tipado e passar para `buildAgentSystem` (função pura Sprint 1.D, não agente Mastra).

LRU em memória (5min, chave `(clientId, personaId, briefingHash)`). Fallback estático determinístico se `vector_query` indisponível ou falhar — **sistema nunca quebra por falha de RAG**. Tool `retrieve_business_context` exposta nos orchestrators (canvas + analítico) para chamada manual quando agente quiser refinar contexto mid-conversation.

**Tech Stack:** AI SDK v6 (`tool` helper), Zod 4, Vertex Gemini via `@ai-sdk/google-vertex` (`getModel`), pgvector + `vector_query` tool (Sprint 2.A), `loadBusinessContext` + `getMacroSnapshot` + `buildAgentSystem` (Sprint 1.D), Vitest (Sprint 1.A). Sem dependência nova além de `lru-cache` (já presente — verificar; se ausente, Task 0).

---

## Pré-requisitos (gate)

- **Sprint 1.A** (Vitest): `vitest.config.ts` ativo, `pnpm test:run` operacional.
- **Sprint 1.D** (entregue): `loadBusinessContext`, `KNOWN_CLIENTS`, perfis JSON 4 clientes × 12 personas × 6 ICPs, `getMacroSnapshot`, `buildAgentSystem`, `lookup_glossary` tool unificada, `GLOSSARY_VERSION`.
- **Sprint 2.A** (BLOQUEIA): tabela `embeddings_docs` populada com 31 docs de `docs/benchmarking/`, namespace por `clientId`, tool `vector_query({query, filters, k})` registrada, embedding model fixado (multilingue, ex: `text-embedding-004`). Se 2.A não entregue, **esta spec não inicia** — alternativa: stub `vector_query` retornando `[]` permite Tasks 1-9 mas Tasks 10-12 ficam bloqueadas até 2.A real.
- **Plano-fonte**: `docs/superpowers/plans/2026-05-04-business-context-personas-evals.md` §3 (retrieval), §3.1 (PII), §3.2 (multi-tenancy), §4 (templates).
- **ADR-0006** (Aceita): `adrs/decisions/0006-multi-tenancy-strict-isolation.md` — namespace por `clientId`, filtro obrigatório, fail-closed, gate adversarial. **Esta spec implementa o gate**; nenhuma ADR nova é necessária.

## Convenções

- Imports `@/...`; sem relativos.
- Testes ao lado (`x.ts` + `x.test.ts`); JSON sem teste próprio (cobertura via loader).
- Cada Task termina em **um único commit**; prefixo `feat(sprint2.D):`, `refactor(sprint2.D):`, `test(sprint2.D):` ou `docs(sprint2.D):`.
- TDD: `Test (RED)` antes de `Implement`. `pnpm test:run -- <arquivo>` após cada implementação.
- Sem comentários redundantes; header curto apenas se exporta API pública.
- PII regex (CPF, CNPJ, RG, email) centralizada em `src/shared/lib/security/pii-scrubber.ts` — **não duplicar**.

---

## File Structure (target)

```
src/features/business-context/
  README.md                             # link para ADR-0006 e visão do pipeline
  index.ts                              # API pública: retrieveBusinessContext, types
  types.ts                              # Zod schemas: BusinessContext, RetrievedChunk, DashboardTemplate
  types.test.ts
  retrieve-persona-themes.ts            # persona → keywords
  retrieve-persona-themes.test.ts
  retrieve-business-context.ts          # pipeline orquestrador
  retrieve-business-context.test.ts
  select-template.ts                    # heurística persona+cliente → template
  select-template.test.ts
  cache.ts                              # LRU 5min
  cache.test.ts
  pii-guard.ts                          # wrapper PII scrubber para working memory
  pii-guard.test.ts
  telemetry.ts                          # latência, cache hit, recall@5
  telemetry.test.ts
  __adversarial__/
    cross-tenant.test.ts                # GATE: 20 queries, zero recall

src/features/ai-agents/tools/
  retrieve-business-context.ts          # tool wrapper para uso pelos agents
  retrieve-business-context.test.ts

src/shared/config/dashboard-templates/
  diretor-fii-cri-om.json
  gestor-carteira-securitizadora-om.json
  cfo-incorporadora-brz.json
  compliance-imcasa.json
  diretor-credito-banco-conx.json
  ceo-incorporadora-brz.json
  templates-loader.ts
  templates-loader.test.ts

src/shared/lib/security/
  pii-scrubber.ts                       # criar se ausente; senão reutilizar
  pii-scrubber.test.ts

src/shared/config/agents/
  build-system.ts                       # MODIFY: aceita retrievedContext opcional

src/features/ai-agents/agents/
  sql-agent.ts                          # MODIFY: usa retrieveBusinessContext
  layout-agent.ts                       # MODIFY: usa template selecionado
  descriptive-agent.ts                  # MODIFY
  predictive-agent.ts                   # MODIFY (se existe; senão skip + nota)

app/(dashboard)/admin/agent-quality/
  retrieval-metrics.tsx                 # opcional, smoke do dashboard

docs/superpowers/plans/
  2026-05-04-sprint2-D-acceptance.md    # roteiro manual final
```

---

## Tasks (TDD)

### Task 0 — Verificação de pré-requisitos

**Files:** nenhum (apenas comandos).

**Steps:**

- [ ] Confirmar Sprint 2.A: `grep -rn "vector_query" src/features/ai-agents/tools/` retorna tool. Se ausente, **PARAR** e abrir issue bloqueando.
- [ ] Confirmar Sprint 1.D: `grep -rn "loadBusinessContext\|buildAgentSystem\|getMacroSnapshot" src/`.
- [ ] Verificar `lru-cache` em `package.json`. Se ausente: `pnpm add lru-cache`.
- [ ] Verificar `src/shared/lib/security/pii-scrubber.ts`. Se ausente, criar Task 1 (já listada).
- [ ] **Commit:** nenhum (etapa de smoke).

---

### Task 1 — PII scrubber compartilhado

**Files:**
- Create/modify: `src/shared/lib/security/pii-scrubber.ts`
- Create: `src/shared/lib/security/pii-scrubber.test.ts`

**Steps:**

- [ ] **Test (RED):**
  - `it('redacts CPF formatted and unformatted')` — `'123.456.789-00'` e `'12345678900'` viram `[REDACTED:CPF]`.
  - `it('redacts CNPJ')`.
  - `it('redacts emails')`.
  - `it('redacts RG patterns')`.
  - `it('preserves non-PII numbers (KPIs, valores)')` — `'LTV 72%'`, `'R$ 1.250.000'` permanecem.
  - `it('scrubObject deeply scrubs string values in nested objects/arrays')`.
  - `it('hashId returns deterministic 12-char hex')`.
- [ ] **Implement:** `scrubText(s)`, `scrubObject<T>(o)`, `hashId(raw)` (sha256, 12 chars). Regex restritivas para evitar falsos positivos.
- [ ] Rodar test → GREEN.
- [ ] **Commit:** `feat(sprint2.D): add shared PII scrubber utilities`.

---

### Task 2 — Zod schemas: `BusinessContext`, `RetrievedChunk`, `DashboardTemplate`

**Files:**
- Create: `src/features/business-context/types.ts`
- Create: `src/features/business-context/types.test.ts`

**Steps:**

- [ ] **Test (RED):**
  - `it('RetrievedChunkSchema requires id, score, text, metadata.clientId')`.
  - `it('RetrievedChunkSchema rejects clientId not in KNOWN_CLIENTS')`.
  - `it('BusinessContextSchema composes static + retrieved + macro')` — campos: `static: {client, persona, icp}`, `retrieved: RetrievedChunk[]`, `macro: MacroSnapshot`, `template: DashboardTemplate | null`, `glossaryVersion: string`, `retrievalMeta: {latencyMs, cacheHit, source: 'rag'|'fallback'}`.
  - `it('DashboardTemplateSchema requires id, persona, client, kpis≥3, visuals≥1, tables≥0')`.
  - `it('DashboardTemplateSchema validates kpi shape: {key, label, formula?, priority}')`.
- [ ] **Implement:**
  ```ts
  import { z } from 'zod';
  import { ClientIdSchema } from '@/shared/config/business-context/schemas';

  export const RetrievedChunkSchema = z.object({
    id: z.string(),
    score: z.number().min(0).max(1),
    text: z.string().min(1),
    metadata: z.object({
      clientId: ClientIdSchema,
      sourceDoc: z.string(),
      themes: z.array(z.string()).default([]),
      productType: z.string().optional(),
      regulatoryArea: z.string().optional(),
    }),
  });
  export const KpiSchema = z.object({
    key: z.string(),
    label: z.string(),
    formula: z.string().optional(),
    priority: z.enum(['critical','high','medium']),
  });
  export const VisualSchema = z.object({
    type: z.string(), title: z.string(), kpis: z.array(z.string()).min(1),
  });
  export const DashboardTemplateSchema = z.object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    persona: z.string(),
    client: ClientIdSchema,
    kpis: z.array(KpiSchema).min(3),
    visuals: z.array(VisualSchema).min(1),
    tables: z.array(z.object({ title: z.string(), columns: z.array(z.string()).min(1) })).default([]),
  });
  export const BusinessContextSchema = z.object({
    static: z.object({/* shape do Sprint 1.D */}).passthrough(),
    retrieved: z.array(RetrievedChunkSchema),
    macro: z.unknown(),
    template: DashboardTemplateSchema.nullable(),
    glossaryVersion: z.string(),
    retrievalMeta: z.object({
      latencyMs: z.number(),
      cacheHit: z.boolean(),
      source: z.enum(['rag','fallback','partial']),
    }),
  });
  export type RetrievedChunk = z.infer<typeof RetrievedChunkSchema>;
  export type DashboardTemplate = z.infer<typeof DashboardTemplateSchema>;
  export type BusinessContext = z.infer<typeof BusinessContextSchema>;
  ```
- [ ] Rodar test → GREEN.
- [ ] **Commit:** `feat(sprint2.D): add Zod schemas for BusinessContext, RetrievedChunk, DashboardTemplate`.

---

### Task 3 — 6 templates JSON persona+cliente + loader

**Files:**
- Create: `src/shared/config/dashboard-templates/diretor-fii-cri-om.json`
- Create: `src/shared/config/dashboard-templates/gestor-carteira-securitizadora-om.json`
- Create: `src/shared/config/dashboard-templates/cfo-incorporadora-brz.json`
- Create: `src/shared/config/dashboard-templates/compliance-imcasa.json`
- Create: `src/shared/config/dashboard-templates/diretor-credito-banco-conx.json`
- Create: `src/shared/config/dashboard-templates/ceo-incorporadora-brz.json`
- Create: `src/shared/config/dashboard-templates/templates-loader.ts`
- Create: `src/shared/config/dashboard-templates/templates-loader.test.ts`

**Steps:**

- [ ] **Read** plano-fonte §4 tabela com 6 KPIs/visuais por linha.
- [ ] **Read** `docs/benchmarking/` (capítulos 6.1, 4.x, 5.x) com `Read` tool para validar KPIs realistas. Acionar agente `credit-risk-analyst` (se disponível) para revisão pós-rascunho; agente `finance-ux-writer` para revisar labels.
- [ ] **Test (RED):** `templates-loader.test.ts`:
  - `it('loadDashboardTemplates returns exactly 6 templates')`.
  - `it('every template validates against DashboardTemplateSchema')`.
  - `it('template ids are unique')`.
  - `it('template.client ∈ KNOWN_CLIENTS')`.
  - `it('every template has ≥3 KPIs and ≥1 visual')`.
  - `it('priority KPIs cover persona priorityKpis')` — para cada template, ao menos 60% dos `priorityKpis` da persona aparecem como KPI key.
- [ ] **Implement** template exemplo (`diretor-fii-cri-om.json`):
  ```json
  {
    "id": "diretor-fii-cri-om",
    "persona": "diretor-fii-cri",
    "client": "OM",
    "kpis": [
      {"key":"oc","label":"Overcollateralization","formula":"(saldo_carteira - saldo_senior)/saldo_senior","priority":"critical"},
      {"key":"es","label":"Excess Spread","formula":"taxa_carteira - taxa_senior - custos","priority":"critical"},
      {"key":"wal","label":"Weighted Average Life","priority":"high"},
      {"key":"pdd","label":"PDD CMN 2.682","priority":"high"},
      {"key":"over_90","label":"Inadimplência Over 90","priority":"critical"},
      {"key":"razao_pmt_saldo","label":"Razão PMT/Saldo","priority":"medium"}
    ],
    "visuals": [
      {"type":"vintage-curve","title":"Curva de inadimplência por safra","kpis":["over_90"]},
      {"type":"transition-matrix","title":"Matriz de transição CMN 2.682","kpis":["pdd"]},
      {"type":"waterfall","title":"Waterfall de DY","kpis":["es","oc"]}
    ],
    "tables": [
      {"title":"Concentração por devedor","columns":["devedor_hash","saldo","%_carteira","rating"]}
    ]
  }
  ```
  - Demais 5 templates seguem matriz §4. Análogos para BRZ/CONX/IMCASA.
- [ ] **Implement loader:**
  ```ts
  import { DashboardTemplateSchema, type DashboardTemplate } from '@/features/business-context/types';
  import t1 from './diretor-fii-cri-om.json';
  // ... demais
  export function loadDashboardTemplates(): DashboardTemplate[] {
    return [t1, t2, t3, t4, t5, t6].map(t => DashboardTemplateSchema.parse(t));
  }
  ```
- [ ] Rodar test → GREEN.
- [ ] **Commit:** `feat(sprint2.D): add 6 persona+client dashboard templates with loader`.

---

### Task 4 — `selectTemplate({personaId, clientId})`

**Files:**
- Create: `src/features/business-context/select-template.ts`
- Create: `src/features/business-context/select-template.test.ts`

**Steps:**

- [ ] **Test (RED):**
  - `it('returns exact match when persona+client pair has template')`.
  - `it('returns persona-only fallback when client mismatch but persona has template')`.
  - `it('returns null when no match (generic analyst path)')`.
  - `it('is deterministic (same inputs → same output)')`.
- [ ] **Implement:** linear scan + dois passes (exato, depois persona-only). Sem regex/heurística complexa.
- [ ] Rodar test → GREEN.
- [ ] **Commit:** `feat(sprint2.D): add selectTemplate heuristic with persona+client fallback`.

---

### Task 5 — `retrievePersonaThemes(personaId)`

**Files:**
- Create: `src/features/business-context/retrieve-persona-themes.ts`
- Create: `src/features/business-context/retrieve-persona-themes.test.ts`

**Steps:**

- [ ] **Test (RED):**
  - `it('maps diretor-fii-cri to [yield, duration, pmt, oc, es, dy, p_vp]')`.
  - `it('maps cfo-securitizadora to [overcollateralization, subordinacao, tranche, patrimonio_separado, pdd, rating]')`.
  - `it('maps controller to [pdd, cmn_2682, ifrs9, provisao, bucket]')`.
  - `it('returns deterministic non-empty array for every KNOWN_PERSONA')` — itera todas 12.
  - `it('returns generic themes for unknown personaId with warning')`.
- [ ] **Implement:** dicionário estático `Record<personaId, string[]>` derivado de `priorityKpis` + `jargonAnchor` da persona (Sprint 1.D). Os IDs (`diretor-fii-cri`, `cfo-securitizadora`, `cfo-incorporadora`, `ceo-incorporadora`, `controller`, `compliance`, `gestor-carteira-securitizadora`, `diretor-credito-banco`, `gestor-credito-obra`, `gestor-repasse-bancario`, `analista-credito`, `analista-cobranca`, etc.) **devem ser exatamente os definidos em `KNOWN_PERSONAS` na Sprint 1.D** (`src/shared/config/business-context/`). Mapeamento textual com 6.1: `diretor-fii-cri` ≡ "Diretor de FII de CRI/recebíveis"; `cfo-securitizadora` / `cfo-incorporadora` desdobram "CFO de incorporadora/securitizadora"; `ceo-incorporadora` ≡ "CEO de incorporadora"; `diretor-credito-banco` ≡ "Diretor de crédito imobiliário de banco"; `gestor-carteira-securitizadora` ≡ "Gestor de carteira de securitizadora". `compliance` é persona derivada do plano-fonte §4 (não listada explicitamente em 6.1) — confirmar slug com Sprint 1.D antes de implementar; se ausente, usar `controller` ou `gestor-carteira-securitizadora` como base. Validar via teste que toda persona em `KNOWN_PERSONAS` tem mapeamento.
  ```ts
  const PERSONA_THEMES: Record<string, string[]> = {
    'diretor-fii-cri': ['yield','duration','pmt','oc','es','dy','p_vp','rating'],
    'cfo-securitizadora': ['overcollateralization','subordinacao','tranche','patrimonio_separado','pdd','rating','wal','duration'],
    'controller': ['pdd','cmn_2682','ifrs9','provisao','bucket','aging'],
    // ... 12 totais
  };
  export function retrievePersonaThemes(personaId: string): string[] {
    return PERSONA_THEMES[personaId] ?? ['analise-credito','imobiliario','geral'];
  }
  ```
- [ ] Rodar test → GREEN.
- [ ] **Commit:** `feat(sprint2.D): add persona→themes mapping for RAG filters`.

---

### Task 6 — LRU cache `(clientId, personaId, briefingHash)`

**Files:**
- Create: `src/features/business-context/cache.ts`
- Create: `src/features/business-context/cache.test.ts`

**Steps:**

- [ ] **Test (RED):**
  - `it('hashKey is stable for same triple regardless of briefing whitespace')` — normaliza trim+lowercase.
  - `it('get returns undefined initially')`.
  - `it('set+get round-trip within TTL returns same context')`.
  - `it('expires after 5min (mock timers)')`.
  - `it('evicts least-recently-used when size>500')`.
  - `it('clear empties the cache')`.
- [ ] **Implement:** wrapper sobre `lru-cache` com TTL 5min, max 500. Hash via `sha256(clientId|personaId|briefing.trim().toLowerCase()).slice(0,16)`.
- [ ] Rodar test → GREEN.
- [ ] **Commit:** `feat(sprint2.D): add LRU cache for retrieved business context`.

---

### Task 7 — `pii-guard`: working memory sanitizer

**Files:**
- Create: `src/features/business-context/pii-guard.ts`
- Create: `src/features/business-context/pii-guard.test.ts`

**Steps:**

- [ ] **Test (RED):**
  - `it('sanitizeWorkingMemory replaces literal CPFs with hashed IDs')`.
  - `it('preserves filter type and replaces value with hash')` — `{filter:'cpf', value:'123.456.789-00'}` → `{filter:'cpf', valueHash:'<12-hex>'}`.
  - `it('throws WorkingMemoryPiiError if scrubber finds residual PII after sanitize (defense in depth)')`.
  - `it('idempotent: sanitize(sanitize(x)) === sanitize(x)')`.
- [ ] **Implement:** combina `scrubObject` (Task 1) + transformação `value → valueHash`. Pós-check com regex falha-fechado.
- [ ] Rodar test → GREEN.
- [ ] **Commit:** `feat(sprint2.D): add PII guard for working memory sanitization`.

---

### Task 8 — `retrieveBusinessContext` orquestrador

**Files:**
- Create: `src/features/business-context/retrieve-business-context.ts`
- Create: `src/features/business-context/retrieve-business-context.test.ts`
- Create: `src/features/business-context/index.ts` (re-exports)

**Steps:**

- [ ] **Test (RED):**
  - `it('returns BusinessContext for valid (clientId, personaId, icpId, briefing)')`.
  - `it('runs vector_query and getMacroSnapshot in parallel')` — instrumenta tempos via mock; valida overlap.
  - `it('passes filters {clientId, themes, productType?, regulatoryArea?} to vector_query')`.
  - `it('caps retrieved chunks at k=5')`.
  - `it('falls back to source=fallback when vector_query throws')` — retrievedMeta.source==='fallback', retrieved=[], demais campos preenchidos.
  - `it('falls back to partial when only one of vector_query/macro fails')`.
  - `it('returns cached result on second call within TTL')` — cacheHit=true.
  - `it('respects AbortSignal — propagates cancellation')`.
  - `it('selects template via selectTemplate and includes in BusinessContext')`.
  - `it('sanitizes working memory before merge (no CPF in output)')`.
  - `it('completes within 2.5s p95 simulated (mock 5 chunks @ 800ms each parallel)')`.
- [ ] **Implement:**
  ```ts
  export interface RetrieveArgs {
    clientId: string; personaId: string; icpId?: string|null;
    briefing: string; workingMemory?: unknown; signal?: AbortSignal;
  }
  export async function retrieveBusinessContext(args: RetrieveArgs): Promise<BusinessContext> {
    const t0 = performance.now();
    const cached = cache.get(hashKey(args));
    if (cached) return { ...cached, retrievalMeta: { ...cached.retrievalMeta, cacheHit: true } };

    const staticCtx = loadBusinessContext({ clientId: args.clientId, personaId: args.personaId, icpId: args.icpId ?? null });
    const themes = retrievePersonaThemes(args.personaId);
    const filters = { clientId: args.clientId, themes, /* productType, regulatoryArea derivados de staticCtx */ };

    const [chunksResult, macroResult] = await Promise.allSettled([
      vectorQuery({ query: args.briefing, filters, k: 5, signal: args.signal }),
      getMacroSnapshot(),
    ]);

    const retrieved = chunksResult.status === 'fulfilled' ? chunksResult.value : [];
    const macro = macroResult.status === 'fulfilled' ? macroResult.value : await loadMacroFallback();
    const source: 'rag'|'fallback'|'partial' =
      chunksResult.status === 'fulfilled' && macroResult.status === 'fulfilled' ? 'rag'
      : chunksResult.status === 'rejected' && macroResult.status === 'rejected' ? 'fallback'
      : 'partial';

    const template = selectTemplate({ personaId: args.personaId, clientId: args.clientId });
    const sanitizedMemory = args.workingMemory ? sanitizeWorkingMemory(args.workingMemory) : undefined;

    const ctx: BusinessContext = {
      static: { ...staticCtx, workingMemory: sanitizedMemory },
      retrieved, macro, template,
      glossaryVersion: GLOSSARY_VERSION,
      retrievalMeta: { latencyMs: performance.now() - t0, cacheHit: false, source },
    };
    cache.set(hashKey(args), ctx);
    recordTelemetry(ctx);
    return ctx;
  }
  ```
- [ ] Rodar test → GREEN.
- [ ] **Commit:** `feat(sprint2.D): add retrieveBusinessContext pipeline orchestrator`.

---

### Task 9 — Tool `retrieve_business_context`

**Files:**
- Create: `src/features/ai-agents/tools/retrieve-business-context.ts`
- Create: `src/features/ai-agents/tools/retrieve-business-context.test.ts`

**Steps:**

- [ ] **Test (RED):**
  - `it('exports tool name retrieve_business_context')`.
  - `it('inputSchema requires clientId, personaId, briefing; icpId optional')`.
  - `it('execute calls retrieveBusinessContext with args')`.
  - `it('returns serializable JSON (no functions, no Date instances raw)')` — `JSON.parse(JSON.stringify(result))` round-trip.
- [ ] **Implement:** wrapper `tool({...})` que delega.
- [ ] Rodar test → GREEN.
- [ ] **Commit:** `feat(sprint2.D): expose retrieve_business_context tool to agents`.

---

### Task 10 — Integrar com `buildAgentSystem` (Sprint 1.D)

**Files:**
- Modify: `src/shared/config/agents/build-system.ts`
- Modify/extend: `src/shared/config/agents/build-system.test.ts`

**Steps:**

- [ ] **Read** assinatura atual.
- [ ] **Test (RED):**
  - `it('accepts optional retrievedContext and renders ## Contexto recuperado section')`.
  - `it('renders top-3 chunks with source_doc citation when retrievedContext.retrieved≥3')`.
  - `it('falls back to static-only output when retrievedContext is undefined (Sprint 1.D backwards compat)')`.
  - `it('renders template KPIs and visuals when template present')`.
  - `it('drops chunks first under token pressure (>10000), keeps template + static + macro')`.
  - `it('preserves block order: static → template → retrieved → macro → glossary → base')` for prompt cache stability.
- [ ] **Implement:** estender args com `retrievedContext?: BusinessContext`. Adicionar `renderTemplate`, `renderRetrieved` (com `[source: <doc>]` citações). Preservar ordem; drop heurístico sob pressão.
- [ ] Rodar test → GREEN.
- [ ] **Commit:** `feat(sprint2.D): extend buildAgentSystem with retrieved context and template rendering`.

---

### Task 11 — Migrar agentes principais (sql, layout, descriptive, predictive)

**Files:**
- Modify: `src/features/ai-agents/agents/sql-agent.ts`
- Modify: `src/features/ai-agents/agents/layout-agent.ts`
- Modify: `src/features/ai-agents/agents/descriptive-agent.ts`
- Modify: `src/features/ai-agents/agents/predictive-agent.ts` (se existe; senão **deixar nota** em `acceptance.md` e seguir).
- Create/extend: `*-agent.test.ts` smoke para cada um.

**Steps:**

- [ ] **Search:** `grep -rn 'buildAgentSystem\|getModel\|streamText' src/features/ai-agents/agents/` para localizar pontos de injeção (ADR-0002: agentes são funções puras chamadas em `streamText`, não `new Agent()` Mastra).
- [ ] **Test (RED) por agente (smoke):**
  - `it('agent factory accepts (clientId, personaId, icpId, briefing) and calls retrieveBusinessContext')`.
  - `it('passes retrievedContext to buildAgentSystem')`.
  - `it('falls back to static-only system when retrieve fails (logged)')`.
  - `it('layout-agent uses template KPIs as prioritized blocks')` — verifica que markdown contém `template.id`.
- [ ] **Implement:** em cada agent factory (função pura `buildXxxAgent({clientId, personaId, icpId, briefing, signal})` consumida por `streamText` no route handler — ADR-0002 Mastra-as-lib, sem `new Agent()` Mastra), antes de chamar `buildAgentSystem`, invocar `retrieveBusinessContext` (com `try/catch` que cai em fallback estático). Repassar `BusinessContext` a `buildAgentSystem(clientId, personaId, icpId, retrievedContext)`. Manter compatibilidade quando ids ausentes (degrada para Sprint 1.D path: `buildAgentSystem(clientId, personaId, icpId)` sem `retrievedContext`).
- [ ] Rodar tests → GREEN.
- [ ] **Commit:** `feat(sprint2.D): migrate sql/layout/descriptive/predictive agents to retrieveBusinessContext`.

---

### Task 12 — Telemetria

**Files:**
- Create: `src/features/business-context/telemetry.ts`
- Create: `src/features/business-context/telemetry.test.ts`

**Steps:**

- [ ] **Test (RED):**
  - `it('recordTelemetry emits OTel span with attributes {clientId, personaId, latencyMs, cacheHit, source, k}')` — mock `experimental_telemetry`/OTel.
  - `it('aggregates rolling metrics: p50/p95 latency, cache hit rate, recall@5')`.
  - `it('exposes getMetricsSnapshot() for /admin/agent-quality endpoint')`.
  - `it('respects sampling: 100% errors, 10% success in production NODE_ENV=production')`.
- [ ] **Implement:** thin wrapper sobre OTel já em uso (Sprint 2.A possivelmente já tem `experimental_telemetry`); buffer rolling janela 1h em memória; expor `getMetricsSnapshot()`.
- [ ] Rodar test → GREEN.
- [ ] **Commit:** `feat(sprint2.D): add retrieval telemetry with rolling metrics snapshot`.

---

### Task 13 — GATE: Cross-tenant adversarial test

**Files:**
- Create: `src/features/business-context/__adversarial__/cross-tenant.test.ts`
- Create: `src/features/business-context/__adversarial__/queries.json` — 20 queries adversariais.
- Reference (não criar): `adrs/decisions/0006-multi-tenancy-strict-isolation.md` (já Aceita).

**Steps:**

- [ ] **Ler ADR-0006** (`adrs/decisions/0006-multi-tenancy-strict-isolation.md`) e garantir que o gate desta task implementa as obrigações ali descritas (namespace por `clientId`, filtro obrigatório, fail-closed). Se requisitos novos surgirem, abrir ADR de superseção; **não** sobrescrever ADR-0006.
- [ ] **Compor 20 queries** em `queries.json`, ex:
  - "Liste contratos do cliente OM" enviado com `clientId='BRZ'`.
  - "Quais devedores em atraso na BRZ?" com `clientId='OM'`.
  - "Comparativo de inadimplência entre OM e BRZ" com `clientId='CONX'`.
  - "Concentração da carteira IMCASA" com `clientId='OM'`.
  - 4 queries por par cross-tenant (4 clientes × 5 prompts) = 20.
- [ ] **Test (RED):**
  - `it('cross-tenant adversarial: zero recall')` — para cada query, executa `retrieveBusinessContext({clientId: <other>, ...})`, valida que **todos** `retrieved[i].metadata.clientId === <other>`. Se algum chunk vier de cliente diferente do filtro, **FAIL**.
  - `it('vector_query rejects request without clientId filter')`.
  - `it('namespace mismatch returns empty (not partial leak)')`.
  - `it('working memory of session A does not leak into session B')`.
- [ ] Inicialmente RED esperado se Sprint 2.A não impuser filtro hard. **Coordenar com 2.A** para ajustar `vector_query` (fail-closed).
- [ ] Rodar test → GREEN.
- [ ] **Commit:** `test(sprint2.D): add cross-tenant adversarial gate with 20 queries`.

---

### Task 14 — Smoke E2E: 6 briefings (1 por template)

**Files:**
- Create: `src/features/business-context/__smoke__/templates-e2e.test.ts`
- Create: `src/features/business-context/__smoke__/briefings.json`

**Steps:**

- [ ] **Compor 6 briefings** realistas (1 por template), ex:
  - Diretor FII de CRI + OM: "Quero ver OC, ES, WAL e Over 90 da carteira por safra do último ano."
  - CEO incorporadora + BRZ: "Como está o VSO e a queima de caixa por empreendimento?"
  - ... etc.
- [ ] **Test (RED):**
  - `it('each briefing yields BusinessContext with template matching expected id')`.
  - `it('retrieved chunks contain expected themes (≥1 chunk com tema da persona)')`.
  - `it('macro snapshot present')`.
  - `it('buildAgentSystem output contains template KPI labels')`.
  - `it('total pipeline latency p95 < 2.5s in mocked env')`.
- [ ] **Implement:** loop sobre briefings; validações por asserts.
- [ ] Rodar test → GREEN.
- [ ] **Commit:** `test(sprint2.D): add E2E smoke for 6 templates with realistic briefings`.

---

### Task 15 — Acceptance manual + checklist

**Files:**
- Create: `docs/superpowers/plans/2026-05-04-sprint2-D-acceptance.md`

**Steps:**

- [ ] **Write** roteiro com:
  1. Pré-condições (Sprint 1.D + 2.A entregues, env vars, MACRO_LIVE).
  2. Roteiro 1 — Persona+cliente match: como Diretor FII / OM, briefing de OC/ES; conferir prompt de servidor cita template `diretor-fii-cri-om`, contém chunks com `metadata.clientId='OM'`.
  3. Roteiro 2 — Cache hit: repetir mesmo briefing, conferir `retrievalMeta.cacheHit=true`, latência <50ms.
  4. Roteiro 3 — Fallback RAG: derrubar conexão pgvector (ou flag); conferir `source='fallback'`, sistema responde com static-only sem erro ao usuário.
  5. Roteiro 4 — Cross-tenant: tentar via UI mudar para BRZ e perguntar sobre OM; conferir resposta não cita dados de OM.
  6. Roteiro 5 — PII: enviar briefing contendo CPF; conferir working memory armazena hash, não valor.
  7. Roteiro 6 — 6 templates: alternar entre 6 personas+clientes; conferir templates renderizados.
  8. Checklist final (copiar Acceptance Criteria abaixo).
- [ ] **Commit:** `docs(sprint2.D): add acceptance roteiro for retrieve_business_context`.

---

## Acceptance Criteria

- ✅ `pnpm test:run` verde (incluindo `__adversarial__/cross-tenant.test.ts`).
- ✅ Cobertura ≥85% em `src/features/business-context/` (`pnpm test:run -- --coverage`).
- ✅ **Cross-tenant adversarial gate**: 20 queries, **zero recall** (nenhum chunk de cliente diferente do `clientId` filtrado).
- ✅ 6 templates persona+cliente válidos (Zod) e selecionados corretamente em smoke E2E.
- ✅ p95 retrieval `<800ms` em cache hit; `<2.5s` em cache miss (medido em telemetria mockada e validado em Roteiro 1-2).
- ✅ Working memory pós-execução não contém PII: regex `[CPF|CNPJ|RG|email]` em `static.workingMemory` retorna zero match.
- ✅ Tool `retrieve_business_context` registrada nos orchestrators (canvas + analítico).
- ✅ `buildAgentSystem` aceita `retrievedContext?` e mantém backwards-compat com Sprint 1.D quando ausente.
- ✅ Fallback estático **sempre disponível**: matar `vector_query` e `getMacroSnapshot` simultâneos retorna `BusinessContext` válido com `source='fallback'` e nunca lança.
- ✅ ADR-0006 (`adrs/decisions/0006-multi-tenancy-strict-isolation.md`) referenciado no README de `src/features/business-context/`; gate implementa todas as obrigações ali listadas.
- ✅ `pnpm build` sem warnings novos.
- ✅ Sem duplicação de regex PII (única fonte: `pii-scrubber.ts`).

---

## Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| Sprint 2.A indisponível ou incompleto | Stub `vector_query` durante Tasks 1-9; Task 10-13 bloqueia até 2.A real; fallback estático determinístico em produção. |
| `vector_query` não impõe filtro `clientId` hard | Task 13 falha → coordenar com Sprint 2.A para fail-closed; ADR-005 documenta exigência. |
| Persona/ICP ausente nos parâmetros do route handler | Schema Zod obrigatório no orchestrator; fallback `analista-generico` com aviso visível em log + `retrievalMeta.source='partial'`. |
| Drift do glossário invalida persona themes | `GLOSSARY_VERSION` propagado; Task 5 testa `every KNOWN_PERSONA tem mapping` — quebra detecta drift. Mudança de versão exige re-rodar smoke E2E. |
| Cache contém PII por bug | Task 7 + post-check fail-closed; cache key não inclui briefing literal (apenas hash). |
| Latência cache miss explode (>2.5s) | `Promise.allSettled` paralelo; k=5 fixo; telemetria p95 alerta; degradação para `partial` quando uma fonte excede 2s. |
| Templates desatualizados (KPIs erradas para persona) | Revisão por agente `credit-risk-analyst` + `finance-ux-writer` em Task 3; campo `_meta.refinedBySme` opcional para flagar revisão. |
| Custo de embeddings em cache miss | Cache LRU 5min absorve 80%+ em uso normal; rate-limiter no `vector_query` é responsabilidade de 2.A. |
| Working memory cross-session (multi-tenant na mesma sessão de usuário multi-cliente) | Cache key inclui `clientId`; PII guard ativa antes de mesclar; teste explícito em Task 13. |
| `predictive-agent` ausente | Task 11 documenta omissão e segue; não bloqueia entrega. |

---

## Self-Review checklist (antes de declarar Sprint 2.D pronto)

- [ ] Rodei `pnpm test:run` e está verde.
- [ ] Rodei `pnpm test:run -- src/features/business-context/__adversarial__/` e gate passa.
- [ ] Rodei `pnpm tsc --noEmit` sem erros novos.
- [ ] Rodei `pnpm build` sem warnings novos.
- [ ] `grep -rn "metadata.clientId" src/features/business-context/` confirma filtro presente em todo path.
- [ ] `grep -rn "CPF\|CNPJ\|email" src/features/business-context/__smoke__/` somente em casos de teste — não em fixtures de output.
- [ ] Acionei `superpowers:verification-before-completion` skill antes de marcar acceptance.
- [ ] README de `src/features/business-context/` linka `adrs/decisions/0006-multi-tenancy-strict-isolation.md`.
- [ ] Roteiro `acceptance.md` executado manualmente; evidências (logs, screenshots) anexadas.
- [ ] Telemetria confirma p95 dentro do budget em ambiente local.
- [ ] Todas as 6 personas+clientes da matriz §4 testadas em smoke E2E.

---

## Engenharia de contexto

- **ADR vinculada**: ADR-0006 `adrs/decisions/0006-multi-tenancy-strict-isolation.md` (Aceita) — namespace por `clientId`, filtro obrigatório, fail-closed, gate adversarial. Esta spec **implementa** o gate; nenhuma ADR nova é criada aqui.
- **Skills**: `superpowers:test-driven-development` (todas as tasks), `superpowers:verification-before-completion` (gate final), `superpowers:subagent-driven-development` (execução paralela das Tasks 3, 5, 7 que são independentes).
- **Agentes auxiliares**: `credit-risk-analyst` para validar mapeamento persona→themes (Task 5) e revisar 6 templates (Task 3); `finance-ux-writer` para revisar labels/KPI titles dos templates.
- **Skills explícitas para o executor**: ao iniciar, invocar `superpowers:executing-plans` ou `superpowers:subagent-driven-development`.
