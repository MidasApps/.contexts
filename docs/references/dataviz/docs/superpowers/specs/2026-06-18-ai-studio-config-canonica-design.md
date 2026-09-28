# AI Studio — Fase 5: Config Canônica (prompts data-driven, fim das flags)

**Date:** 2026-06-18
**Status:** Draft
**Sub-projeto de:** AI Studio (Agents/Skills/KB/Workflows). Fecha a lacuna de **fidelidade**: a config passa a ser a fonte de verdade real de todo conteúdo estático/editável dos prompts, e o contexto dinâmico deixa de ser descartado.
**Depende de:** Fases 0–4B (entidades CRUD, seed, runtime Mastra, supervisor + roteador). Esta fase **descontinua** o mecanismo de rollout (flags `AI_STUDIO_*` + fallback duplo) introduzido nas Fases 1–4.
**Relacionado:** **ADR-0016** (AI Studio config data-driven — esta fase a realiza por completo), **ADR-0017** (NOVA — config canônica; descontinua flags `AI_STUDIO_*`; supersede o rollout faseado), ADR-0014 (Mastra runtime), ADR-0006 (multi-tenancy), ADR-0008 (tool gating).

## Goal

Tornar a configuração do AI Studio (Agents/Skills/KB/Workflows) a **fonte de verdade única e editável** de todo conteúdo estático dos prompts — persona, capacidades, guia de tools, glossário, regras regulatórias (rating/PDD/covenants/cenários/macro), regras de SQL/resposta e árvore de roteamento. O contexto **dinâmico por request** (filtros ativos, schema do dataset, semantic context, estado do dashboard) continua sendo computado em runtime e passa a ser **sempre anexado** por baixo da instrução editável. Como o produto **não está em produção (sem clientes)**, removemos as flags `AI_STUDIO_*` e o fallback duplo: a config é canônica, com fallback ao baseline em código apenas como rede de segurança (resiliência), não como caminho paralelo de comportamento.

## Problem

Auditoria (file:line) confirmou que a config **não é fiel** aos prompts hardcoded e que o caminho data-driven atual é **lossy**:

1. **Seeds rasos.** `src/features/ai-studio/seed/manifest.ts:22-66` — os 9 agentes têm `instructions` de 1 frase (15–50 palavras). Ex.: `descriptive` = *"Descreva o estado da carteira com dados… nunca invente números."* O prompt real `buildDescriptiveAgentPrompt` (`src/shared/config/agents/descriptive-agent.ts:4-65`) tem 600–900 tokens: persona + 6 capacidades + guia de 11 tools + tabela de benchmarks + SQL rules + schema + business context + tom/estilo.
2. **Workflow default raso.** `manifest.ts:54` é 1 frase; a árvore de roteamento real `buildOrchestratorPrompt` (`src/shared/config/agents/orchestrator.ts:16-212`) tem ~5.000 tokens (9 categorias, desambiguação, paralelo/sequencial, follow-up, regras obrigatórias). *(Mitigado hoje: o supervisor compõe `buildOrchestratorPrompt(ctx) + workflow.instruction` — `build-supervisor-agent.ts` —, então o roteamento não se perde; só o workflow é raso.)*
3. **Contexto dinâmico descartado (bug crítico).** `src/features/ai-studio/runtime/resolve-agent.ts:13-25` — com `flagOn`, retorna **só** `[cfg.instructions, ...skillPlaybooks]` e **ignora** o `fallback` (o builder que injeta schema/glossário/filtros/semantic). Logo, com `AI_STUDIO_AGENTS=on` + seed raso, o agente perde ~95–100% do contexto: schema do BigQuery, glossário, escala de rating, PDD/Res. 2682, regras de SQL, filtros ativos e semantic context **somem**.
4. **Dois caminhos divergentes.** Flag-off = prompt rico em código; flag-on = config rasa. Mantido por zero-regressão, mas sem clientes isso é complexidade morta (4 flags env + 4 flags app-store + fallback duplo em `create-mastra-agent-from-config.ts`).

Recursos confirmados que tornam a correção barata:
- Os blocos compartilhados **já estão fatorados** em `shared-context.ts`: `buildBusinessContext()` (`:56`), `buildSchemaContext()` (`:149`), `buildDynamicFilterContext(ctx)` (`:157`), `SQL_RULES` (`:207`), `RESPONSE_GUIDELINES` (`:223`), `renderSemanticContextSections(ctx)` (`:299`).
- `resolveAgentInstructions` já anexa playbooks de skills (`resolve-agent.ts:20`) — o mecanismo de "skill = conhecimento sempre-injetado" já existe.
- `ensureSeed` é create-if-absent (`ensure-seed.ts:10`) — preserva edições do admin.
- Manifesto de tools em `tools-manifest.ts:11-31` (chave correta: `bq_dry_run_sql`).

## Decisões (do brainstorming)

1. **Três camadas, três donos.** (a) Estático específico do agente → `Agent.instructions`. (b) Conhecimento estático compartilhado → **Skills** (playbook sempre-injetado, reusável). (c) Dinâmico por request → **runtime (código)**, sempre anexado. Corpus grande/opcional (docs de mercado/produto) → **Knowledge Bases** (retrieval).
2. **Skills, não KB, para conhecimento sempre-presente.** Glossário/rating/PDD/SQL-rules são injetados incondicionalmente hoje; KB é retrieval top-k (lossy). Skill playbook é editável, reusável e sempre-injetado — mesmo mecanismo já existente. KB fica reservada ao corpus volumoso.
3. **Código continua sendo o baseline canônico; o seed o espelha no Firestore.** Cada `buildXStatic()` permanece em código como (i) fonte do valor seedado e (ii) fallback de resiliência. Editar = mudar no Firestore (vence em runtime). "Restaurar padrão" = reaplicar o baseline em código.
4. **Config canônica; sem flags.** Remover `AI_STUDIO_AGENTS/KB/SKILLS/WORKFLOWS` (env + app-store) e o fallback duplo. Runtime sempre lê config; se falhar/ausente → fallback ao baseline em código (composição estática + dinâmico). Nunca caminho cego.
5. **Modelo lido da config.** `model` do doc do agente é um `ModelTier` (`router`/`fast`/`reasoning`/`flash`) e mapeia via `getModel(tier)` (não mais `vertex(...)` hardcoded por adaptador). Tiers seedados = os reais de hoje (`reasoning` para diagnostic/predictive/prescriptive/monitoring/simulation; `fast` para descriptive/external/cashflow; `router` para orchestrator).
6. **Tools permanecem code-wired nesta fase.** O set real de tools de cada agente já vem do `buildToolsFactory` (`buildXAgentTools`, hardcoded). `toolRefs` (config) seguem como camada **aditiva** sobre essa base, **vazias** no seed — sem regressão e sem o mismatch `bq_dry_run_sql`×`dry_run_sql`. Tornar o catálogo de tools data-driven (expandir manifesto + `buildToolsFromKeys` cobrir todas + aposentar `buildToolsFactory`) é **fase seguinte** (ver Out of scope).
7. **Reseed `--force` para `origin:'system'`.** One-time: sobrescreve os docs de sistema rasos pelo conteúdo novo; **não toca** docs `origin:'user'`. `ensureSeed` (create-if-absent) permanece para boot normal.
8. **ADR-0017** documenta a config canônica e supersede o rollout faseado. Sem novas flags.

## Reaproveitamento (intocado / estendido / removido)

- **Intocado:** helpers de `shared-context.ts` (apenas re-roteados); `createKbRetrievalTool`; `buildToolsFromKeys`; `resolveAgentCapabilities` (perde só o parâmetro de flag); padrão de envelope/origin/locked/reset; `AiStudioRepo`.
- **Estendido:** cada `*-agent.ts` ganha `buildXStatic()` (extraído); `orchestrator.ts` ganha `buildOrchestratorStatic()`; `manifest.ts` importa esses + textos de skill; `create-mastra-agent-from-config.ts` compõe `[config, dynamic]` e lê model da config; `build-supervisor-agent.ts` usa instruções do orchestrator vindas da config; `resolve-agent.ts` (assinatura sem flag, fallback resiliente); seed script com `--force`.
- **Removido:** flags `AI_STUDIO_*` (env), `useAiStudio*`/setters (app-store), e os ramos `flagOn` em runtime.
- **Intocado (out of scope):** `orchestrator.ts` legado e os `createXAgent` legados (não são o caminho do chat); `buildXAgentPrompt(ctx)` completo permanece funcional para esses callers (passa a compor `buildXStatic()` + blocos + dinâmico, preservando comportamento).

## Componentes

```
src/shared/config/agents/
  descriptive-agent.ts      MODIFY — extrai buildDescriptiveStatic() (persona+guia+benchmarks+tom); buildXAgentPrompt recompõe a partir dele
  diagnostic-agent.ts       MODIFY — buildDiagnosticStatic() (inclui tabelas HHI/polaridade no estático)
  predictive-agent.ts       MODIFY — buildPredictiveStatic() (inclui early-warning no estático)
  prescriptive-agent.ts     MODIFY — buildPrescriptiveStatic() (inclui scoring de ações no estático)
  monitoring-agent.ts       MODIFY — buildMonitoringStatic() (inclui covenants/CVM no estático)
  simulation-agent.ts       MODIFY — buildSimulationStatic() (inclui cenários no estático)
  external-agent.ts         MODIFY — buildExternalStatic() (inclui BCB/macro no estático)
  cashflow-agent.ts         MODIFY — buildCashflowStatic() (inclui métricas WAL/spread no estático)
  orchestrator.ts           MODIFY — buildOrchestratorStatic() + buildOrchestratorDynamicContext(ctx)
  dynamic-context.ts        CREATE — buildAgentDynamicContext(ctx) (filtros + semantic [+ dashboard])
  skill-playbooks.ts        CREATE — textos canônicos das 4 skills (re-exporta SQL_RULES/RESPONSE_GUIDELINES/buildSchemaContext()/buildBusinessContext())

src/features/ai-studio/
  seed/manifest.ts          MODIFY — instruções completas (importadas dos builders) + 4 skills + skillRefs/model por agente + orchestrator + workflow
  runtime/resolve-agent.ts  MODIFY — resolveAgentInstructions(systemKey, codeFallback): sem flag; Firestore→fallback resiliente
  runtime/resolve-capabilities.ts  MODIFY — remove parâmetro de flag (sempre lê config)
  runtime/config-loader.ts  (intocado ou ajuste menor de assinatura)

src/features/ai-agents/mastra/
  create-mastra-agent-from-config.ts  MODIFY — compõe [resolveAgentInstructions, buildAgentDynamicContext(ctx)]; model da config; sem flags
  build-supervisor-agent.ts           MODIFY — usa instruções do orchestrator (config) + workflow.instruction + dynamic
  {8 adaptadores}-agent-mastra.ts      MODIFY — passam buildXStatic como codeFallback + buildXDynamic; model da config
  instance.ts               (intocado — fail-soft por agente permanece)

app/api/chat/route.ts       MODIFY — remove gate AI_STUDIO_WORKFLOWS (sempre roteia via workflow)
app/api/chat/resolve-chat-agent.ts  MODIFY — sem flags
src/shared/stores/app-store.ts       MODIFY — remove useAiStudio* + setters
scripts/seed-ai-studio.ts   MODIFY — flag --force (sobrescreve origin:'system')

adrs/decisions/0017-ai-studio-config-canonica.md  CREATE
```

### Camada estática vs. dinâmica (roteamento de cada bloco)

| Bloco (hoje em código) | Vai para | Mecanismo |
|---|---|---|
| Persona + capacidades + guia de tools + regra fundamental + benchmarks + tom/estilo (por agente) | `Agent.instructions` (`buildXStatic()`) | config, sempre injetado |
| `RESPONSE_GUIDELINES` (pt-BR, concisão, ask_user, tratamento de erro) | Skill `response-style` | playbook |
| `SQL_RULES` | Skill `sql-foundations` | playbook |
| `buildSchemaContext()` | Skill `portfolio-schema` | playbook |
| `buildBusinessContext()` (glossário+rating+PDD+fórmulas) | Skill `credit-domain` | playbook |
| Blocos de domínio **não compartilhados** (covenants/CVM — monitoring; early-warning — predictive; cenários de stress — simulation; BCB/macro — external; scoring de ações — prescriptive; métricas WAL/spread — cashflow; tabelas HHI/polaridade — diagnostic) | `Agent.instructions` do agente (`buildXStatic()`) | config, sempre injetado |
| Árvore de roteamento + desambiguação + paralelo/sequencial + regras obrigatórias | `Agent.instructions` do `orchestrator` (`buildOrchestratorStatic()`) | config, base do supervisor |
| Especialização por comando | `Workflow.instruction` | overlay |
| `buildDynamicFilterContext(ctx)` + `renderSemanticContextSections(ctx)` + dashboard state | `buildAgentDynamicContext(ctx)` | runtime, sempre anexado |
| focusedIndicator + dashboardState + página (orchestrator) | `buildOrchestratorDynamicContext(ctx)` | runtime, sempre anexado |
| Docs de mercado/produto/negócio + corpus de benchmarking | Knowledge Bases | retrieval (`kb_retrieval`) |

### Skills de sistema (seed)

Cada skill: `{ type:'skill', id, doc:{ name, description, playbook, toolRefs, status:'active', origin:'system', systemKey:id, knowledgeBaseRefs:[] } }`. Playbooks importados dos textos canônicos (sem cópia literal divergente).

| Skill | Playbook | toolRefs |
|---|---|---|
| `response-style` | `RESPONSE_GUIDELINES` | — |
| `sql-foundations` | `SQL_RULES` | — |
| `portfolio-schema` | `buildSchemaContext()` | — |
| `credit-domain` | `buildBusinessContext()` | — |

São **4 skills de sistema**, **todas referenciadas pelos 8 sub-agentes** (todos escrevem SQL e usam o domínio de crédito — confirmado: cada `buildXAgentTools` concede `execute_sql`+`dry_run_sql` e cada builder injeta `SQL_RULES`+`buildSchemaContext()`+`buildBusinessContext()`+`RESPONSE_GUIDELINES`). **toolRefs vazias nesta fase**: as tools reais já vêm 100% do `buildToolsFactory` (set hardcoded por agente); a camada aditiva `toolRefs`/manifesto fica como gancho futuro (ver Out of scope). Conhecimento **não compartilhado** (covenants, early-warning, cenários, BCB/macro, scoring de ações, métricas de cashflow, tabelas HHI) permanece em `Agent.instructions` do agente dono.

### skillRefs / toolRefs / model por agente (seed)

`skillRefs` uniforme (as 4 skills) para os 8 sub-agentes. `toolRefs` vazias (tools vêm do `buildToolsFactory`; camada aditiva fica como gancho futuro). `model` é o **tier real** que o adaptador Mastra usa hoje (`vertex('gemini-2.5-pro')` → `reasoning`; `vertex('gemini-2.5-flash')` → `fast`; `flash-lite` → `router`) — alinhado ao comportamento atual, não ao campo `model` do seed antigo (que diverge).

| Agente | model (tier) | skillRefs | toolRefs |
|---|---|---|---|
| orchestrator | router | — | — |
| descriptive | fast | response-style, sql-foundations, portfolio-schema, credit-domain | [] |
| diagnostic | reasoning | response-style, sql-foundations, portfolio-schema, credit-domain | [] |
| predictive | reasoning | response-style, sql-foundations, portfolio-schema, credit-domain | [] |
| prescriptive | reasoning | response-style, sql-foundations, portfolio-schema, credit-domain | [] |
| monitoring | reasoning | response-style, sql-foundations, portfolio-schema, credit-domain | [] |
| simulation | reasoning | response-style, sql-foundations, portfolio-schema, credit-domain | [] |
| external | fast | response-style, sql-foundations, portfolio-schema, credit-domain | [] |
| cashflow | fast | response-style, sql-foundations, portfolio-schema, credit-domain | [] |

Domínio específico de cada agente (covenants/CVM no monitoring; early-warning no predictive; cenários no simulation; BCB/macro no external; scoring de ações no prescriptive; métricas WAL/spread no cashflow; tabelas HHI/polaridade no diagnostic) fica em `buildXStatic()` → `Agent.instructions`.

### resolveAgentInstructions (nova assinatura)

```
resolveAgentInstructions(systemKey: string, codeFallback: string): Promise<string>
  // Sempre tenta config:
  try {
    cfg = await loadAgentConfig(systemKey)
    if (cfg?.instructions?.trim()) {
      playbooks = await loadSkillPlaybooks(cfg.skillRefs ?? [])
      return [cfg.instructions, ...playbooks].join('\n\n')
    }
  } catch (e) { log('[ai-studio] config indisponível, usando baseline de código', e) }
  return codeFallback   // baseline em código (estático completo) — resiliência, não caminho paralelo
```
`codeFallback` para um sub-agente = `[buildXStatic(), SQL_RULES, buildSchemaContext(), buildBusinessContext(), RESPONSE_GUIDELINES]` (os mesmos blocos que o seed espelha). O dinâmico é anexado pelo chamador, fora desta função.

### create-mastra-agent-from-config (nova composição)

```
const codeStatic = composeCodeStatic(systemKey, ctx)         // baseline estático
const instr = await resolveAgentInstructions(systemKey, codeStatic)
const instructions = [instr, buildAgentDynamicContext(ctx)].join('\n\n')   // dinâmico SEMPRE
const caps = await resolveAgentCapabilities(systemKey)        // agent.toolRefs ∪ skill.toolRefs
const tools = buildToolsFromKeys(caps.toolKeys, ctx)
if (caps.kbRefs?.length || cfgKbRefs?.length) tools.kb_retrieval = createKbRetrievalTool({...})  // try/catch
return new Agent({ id:`${systemKey}_agent`, name, description, instructions,
                   model: modelFromTier(cfg.model ?? defaultTier), tools })
```

### build-supervisor-agent (data-driven)

```
const orchestratorStatic = composeOrchestratorStatic(ctx)
const instr = await resolveAgentInstructions('orchestrator', orchestratorStatic)
const instructions = [instr, workflow.instruction, buildOrchestratorDynamicContext(ctx)].join('\n\n')
new Agent({ id:'supervisor', ..., instructions, model: getModel('router'), agents: subAgents })
```

## Data flow

```
/api/chat → buildMastraInstance({ctx}) → cada agente:
   instructions = [ agent.instructions(Firestore) , ...skillPlaybooks(Firestore) , buildAgentDynamicContext(ctx) ]
                   └ se Firestore falhar → baseline em código (mesmo conteúdo) ┘
   tools = buildToolsFromKeys(agent.toolRefs ∪ skill.toolRefs, ctx) [+ kb_retrieval]
→ selectWorkflow(command) → buildSupervisorAgent(orchestrator.instructions + workflow.instruction + dynamic)
→ stream (conversão Mastra→UI inalterada)
```
Sem ramo de flag. O dinâmico (schema do dataset via `portfolio-schema` + filtros/semantic via `buildAgentDynamicContext`) está **sempre** presente.

## Error handling

- **Config indisponível/ausente (fail-soft):** fallback ao baseline em código (estático completo) + dinâmico; logado. O chat nunca roda cego nem quebra.
- **skillRef inexistente/inativa:** ignorada com warning (padrão soft-ref já existente). Só resolução de dados (`resolveColumn`) é fail-loud.
- **toolRef fora do manifesto:** ignorada com warning (não derruba o agente).
- **KB indisponível:** `kb_retrieval` retorna vazio; agente prossegue.
- **Reseed `--force`:** transacional por doc; sobrescreve apenas `origin:'system'`; `origin:'user'` intocado. `ensureSeed` (boot) permanece create-if-absent.
- **Tenancy (ADR-0006):** `buildXAgentTools` preservam exposição condicional por `clientId`/`personaId`.

## Re-seed / migração

1. Rodar o reseed `--force` uma vez (sobrescreve os 9 agentes + cria as 4 skills + atualiza workflow/KB com conteúdo novo). Comando: `pnpm exec tsx --env-file=.env.local scripts/seed-ai-studio.ts --force`.
2. (Opcional, separável) Migrar corpus de benchmarking para a KB default via `scripts/migrate-embeddings-to-kb.ts` e setar `knowledgeBaseRefs` nos agentes que usam retrieval — pode ser tarefa final ou follow-up (YAGNI se o retrieval não for prioridade agora).

## Testing

- **`buildXStatic()` (9):** unit — retorna texto sem interpolar `ctx` (não contém dataset/filtros); contém persona + guia de tools.
- **`buildAgentDynamicContext(ctx)`:** unit — inclui filtros ativos + semantic; muda com `ctx`.
- **Composição (central):** unit — `instructions` = `[config.instructions, ...playbooks, dynamic]` nessa ordem; **dinâmico sempre presente** (asserção: prompt final contém schema/glossário/filtros mesmo com instrução de config curta).
- **Skills (4):** unit — `response-style`/`sql-foundations`/`portfolio-schema`/`credit-domain` playbooks carregam o texto canônico (golden snapshot do trecho-chave); as 4 referenciadas pelos 8 sub-agentes; `resolveAgentCapabilities` com `toolRefs` vazias devolve apenas `agent.toolRefs` (também vazias) → tools = base do `buildToolsFactory` (não-regressão).
- **Supervisor:** unit — instruções = orchestrator(config) + workflow.instruction + dynamic.
- **Model da config:** unit — `model:'reasoning'` → `getModel('reasoning')`; `'fast'` → `getModel('fast')`; `'router'` → `getModel('router')`.
- **Fallback resiliente:** unit — `loadAgentConfig` lança/vazio → usa baseline de código (estático completo), logado; nunca string vazia.
- **Reseed `--force`:** unit (fake Firestore) — sobrescreve `origin:'system'`; preserva `origin:'user'`; sem `--force` mantém create-if-absent.
- **Remoção de flags (regressão):** grep garante zero referências a `AI_STUDIO_AGENTS/KB/SKILLS/WORKFLOWS` e `useAiStudio*`; rota de chat e testes existentes verdes com a nova composição.
- **Build:** `pnpm build` + `tsc` verdes.
- **Run (Docker):** subir o container (sem as flags), reseed `--force`, smoke do chat — confirmar que a resposta usa glossário/schema/filtros.

## Out of scope (YAGNI)

- **Tool-catalog data-driven (fase seguinte):** expandir o manifesto para todas as ~40 tools reais, fazer `buildToolsFromKeys` construir todas e aposentar `buildToolsFactory`, tornando `toolRefs` a fonte de verdade da seleção de tools. Nesta fase as tools permanecem code-wired (set real via `buildToolsFactory`); `toolRefs` ficam vazias (gancho aditivo).
- Aposentar `orchestrator.ts` legado / `createXAgent` (permanecem; `buildXAgentPrompt` segue funcional).
- Schema dinâmico por introspecção do dataset real (hoje `portfolio-schema` é texto canônico editável; introspecção é follow-up).
- UI de admin nova (CRUD de skills já existe; só ganha 4 registros de sistema).
- `@mastra/memory` por agente (ADR futura).
- Migração do corpus de benchmarking para KB se decidida como follow-up.

## Open questions

- Nenhuma bloqueante. Com `toolRefs` vazias e tools vindas do `buildToolsFactory`, o mismatch `bq_dry_run_sql`×`dry_run_sql` não afeta o runtime nesta fase; a reconciliação completa do manifesto fica para a fase de tool-catalog data-driven.
