# AI Studio — Fase 6: Tools data-driven

**Date:** 2026-06-18
**Status:** Draft
**Sub-projeto de:** AI Studio. Fecha a última dimensão hardcoded dos agentes: o **catálogo de tools** passa a ser selecionável por config (`agent.toolRefs`), completando o "tudo hardcoded → config" iniciado nas Fases 1–5.
**Depende de:** Fase 5 (config canônica; `create-mastra-agent-from-config` compõe instruções+dynamic e lê model da config; `resolveAgentCapabilities`; `TOOL_REGISTRY`/`buildToolsFromKeys`; reseed `--force`).
**Relacionado:** **ADR-0017** (config canônica — esta fase realiza a dimensão de tools que a ADR deixou como follow-up; **sem ADR nova**), ADR-0016 (config data-driven), ADR-0008 (tool gating por fase/agente), ADR-0006 (multi-tenancy — exposição condicional de tools server-bound).

## Goal

Tornar o conjunto de tools de cada agente **editável por config**: `agent.toolRefs` (Firestore) vira a fonte de verdade de quais tools o agente recebe, o `TOOL_REGISTRY` cobre **todas** as tools reais (incluindo as inline e as tenancy-conditional), e o `create-mastra-agent-from-config` constrói as tools **só** a partir das keys resolvidas (`agent.toolRefs ∪ skill.toolRefs`). O código mantém `DEFAULT_AGENT_TOOLS` (lista de keys por agente) como **fonte do seed** e **fallback resiliente** — espelhando exatamente o padrão `buildXStatic` da Fase 5 (config canônica, baseline de código como rede de segurança). O admin ganha um multi-select de tools no editor de agente. Fidelidade total: o set data-driven de cada agente reproduz o set atual de `buildXAgentTools`.

## Problem

Pós-Fase 5, instruções/skills/KB/model são data-driven, mas **as tools continuam code-wired**:

1. **`TOOL_REGISTRY` cobre só ~11 keys.** `src/features/ai-studio/runtime/tool-registry.ts:32-45` mapeia execute_sql, bq_dry_run_sql, get_table_schema, get_sample_data, calculate_statistics, build_vintage_curves, lookup_glossary, vector_query, recall_similar_sql, bq_list_validated_queries. As ~40+ outras tools usadas pelos agentes **não estão no registry**.
2. **`buildXAgentTools` monta o set real (code-wired).** Cada `src/features/ai-agents/agents/{X}-agent.ts` exporta `buildXAgentTools(ctx)` que constrói o conjunto completo do agente — reusando as factories `create*Tool`, **tools inline** (`read_dashboard_state`/`read_active_filters` em descriptive — `descriptive-agent.ts:40-64`; `get_baseline` inline em simulation), e **spreads tenancy-conditional** (recall/list/save). Na Fase 5 o seed deixou `toolRefs: []` e as tools vinham 100% desse `buildToolsFactory`.
3. **Mismatch de chave.** O mesmo tool tem keys divergentes por caminho: `dry_run_sql` (buildXAgentTools, `descriptive-agent.ts:33`) vs `bq_dry_run_sql` (registry/manifesto); `list_validated_queries` vs `bq_list_validated_queries`. O manifesto (`tools-manifest.ts`) tem só 19 keys, várias divergentes do runtime.
4. **Admin não edita tools.** O editor de agente tem `MultiRefSelect` para `skillRefs`/`knowledgeBaseRefs`, mas não para `toolRefs`. A aba Tools é só catálogo read-only.

Recursos que tornam a migração barata:
- `ToolFactory = (ctx: AgentDynamicContext) => unknown | null` (`tool-registry.ts:14`) já aceita tools inline (factory que retorna `tool({...})`) e tenancy (retorna `null` sem clientId/personaId).
- `buildToolsFromKeys` (`tool-registry.ts:51-71`) já pula key sem factory (warn) e factory `null` (tenancy) — fail-soft.
- `resolveAgentCapabilities(systemKey)` (Fase 5) já une `agent.toolRefs ∪ skill.toolRefs`.
- `create-mastra-agent-from-config.ts` (Fase 5) já chama `buildToolsFromKeys(caps.toolKeys, ctx)` **aditivamente** sobre o `buildToolsFactory`; basta a base virar `[]` e o registry cobrir tudo.

## Decisões (do brainstorming)

1. **Alvo: data-driven completo + fallback + UI.** `agent.toolRefs` canônico; registry cobre tudo; aposenta o `buildToolsFactory` no caminho Mastra; `DEFAULT_AGENT_TOOLS` (código) = fonte do seed + fallback resiliente; admin ganha multi-select de tools.
2. **Chaves canônicas = nomes LLM-facing atuais.** `dry_run_sql` (não `bq_dry_run_sql`), `list_validated_queries` (não `bq_list_validated_queries`). O manifesto e o registry são atualizados para essas chaves — preserva o que os prompts (ex.: RESPONSE_GUIDELINES cita `dry_run_sql`) e o modelo já usam. A factory por trás é a mesma (`createBqDryRunSqlTool`/`createBqListValidatedQueriesTool`); só a KEY exposta muda/unifica.
3. **Tools ficam no agente; skills com `toolRefs: []`.** `agent.toolRefs` carrega o set completo do agente (explícito p/ o admin). Skills-concedem-tools continua disponível via `resolveAgentCapabilities` (união), mas não usado no seed.
4. **`buildXAgentTools` legado permanece.** Ainda é usado por `createXAgent`/orchestrator legado (fora de escopo, como `buildXAgentPrompt` na Fase 5). `DEFAULT_AGENT_TOOLS` espelha seu set; um **teste de fidelidade** por agente garante paridade.
5. **Tenancy preservada** pelo registry (factory→`null`; `buildToolsFromKeys` pula). ADR-0006 intacta.
6. **Sem ADR nova** (realiza o follow-up de tools de ADR-0016/0017).

## Reaproveitamento (intocado / estendido / removido)

- **Intocado:** as factories `create*Tool` em `src/features/ai-agents/tools/`; `buildToolsFromKeys` (já fail-soft); `resolveAgentCapabilities`; `ToolFactory`/`toolCtxOf`; `buildXAgentTools` legado e `createXAgent` (não são o caminho do chat); `MultiRefSelect`.
- **Estendido:** `TOOL_REGISTRY` (cobre todas as keys + inline movidas); `tools-manifest.ts` (todas as keys, canônicas); `seed/manifest.ts` (`toolRefs = DEFAULT_AGENT_TOOLS[key]`); `create-mastra-agent-from-config.ts` (remove `buildToolsFactory`, fallback p/ DEFAULT); 8 adaptadores (removem o arg); `AiAgentsTab.tsx` (multi-select de toolRefs).
- **Removido (do caminho Mastra):** o input `buildToolsFactory` de `create-mastra-agent-from-config` e a passagem de `buildXAgentTools` pelos 8 adaptadores.

## Componentes

```
src/features/ai-studio/runtime/tool-registry.ts          MODIFY — TOOL_REGISTRY cobre TODAS as keys; move inline tools p/ factories; chaves canônicas
src/features/ai-studio/tools-manifest.ts                 MODIFY — todas as ~50 keys (key/name/description/category), canônicas
src/shared/config/agents/default-agent-tools.ts          CREATE — DEFAULT_AGENT_TOOLS: Record<systemKey, string[]>
src/features/ai-studio/seed/manifest.ts                  MODIFY — agent.toolRefs = DEFAULT_AGENT_TOOLS[id]
src/features/ai-agents/mastra/create-mastra-agent-from-config.ts  MODIFY — sem buildToolsFactory; tools via registry; fallback DEFAULT
src/features/ai-agents/mastra/{8}-agent-mastra.ts        MODIFY — removem o arg buildToolsFactory
src/features/ai-studio/admin/ui/AiAgentsTab.tsx          MODIFY — MultiRefSelect de toolRefs (lê o manifesto)
```

### TOOL_REGISTRY (expandido)

Mapa `key → (ctx: AgentDynamicContext) => Tool | null` cobrindo **todas** as tools. Três classes:
- **Factory compartilhada** (maioria): `key: (ctx) => createXxxTool(toolCtxOf(ctx))`.
- **Inline → factory** (movidas de buildXAgentTools): `read_dashboard_state`, `read_active_filters` (de descriptive), `get_baseline` (de simulation) viram `key: (ctx) => tool({...})` no registry, fechando sobre `ctx` (que tem `dashboardState`/`filters`/`page`).
- **Tenancy-conditional**: `key: (ctx) => ctx.clientId && ctx.personaId ? createXxxTool(...) : null` (recall_similar_sql, list_validated_queries, save_validated_query); `vector_query` só exige `clientId`.

Inventário por agente (do audit; **o plano reconcilia exatamente contra cada `buildXAgentTools`**):

| Agente | tool keys (DEFAULT_AGENT_TOOLS) |
|---|---|
| descriptive | dry_run_sql, execute_sql, get_table_schema, get_sample_data, calculate_statistics, build_vintage_curves, build_transition_matrix, read_dashboard_state, read_active_filters, lookup_glossary, recall_similar_sql†, list_validated_queries†, save_validated_query† |
| diagnostic | dry_run_sql, execute_sql, get_table_schema, get_sample_data, calculate_correlations, calculate_hhi, decompose_variation, run_hypothesis_test, list_validated_queries†, save_validated_query† |
| predictive | dry_run_sql, execute_sql, forecast_timeseries, calculate_pd_lgd, build_survival_curve, generate_early_warnings, calculate_cpr_cdr, build_vintage_curves, build_transition_matrix, bqml_list_models, bqml_suggest_model, bqml_create_or_use_model, bqml_forecast, bqml_predict, bqml_detect_anomalies, schema_describe_relationships |
| prescriptive | dry_run_sql, execute_sql, run_clustering, run_causal_analysis, optimize_allocation, rank_actions, evaluate_impact |
| monitoring | dry_run_sql, execute_sql, detect_anomalies, check_eligibility, check_concentration_limits, check_covenant_triggers, generate_compliance_report, bqml_list_models, bqml_forecast, bqml_detect_anomalies |
| simulation | dry_run_sql, execute_sql, get_baseline, run_sensitivity, run_scenario, run_monte_carlo, apply_stress_macro, calculate_stressed_ecl |
| external | dry_run_sql, execute_sql, search_web, get_bcb_indicator, parse_macro_data, sentiment_analysis, extract_regulatory_updates, get_market_benchmarks |
| cashflow | dry_run_sql, execute_sql, calculate_wal, calculate_excess_spread, calculate_coverage_ratios, compare_cashflows, decompose_payments |

† tenancy-conditional (só com `clientId`+`personaId`). orchestrator (supervisor) não recebe tools de dados — delega aos sub-agentes (inalterado).

### DEFAULT_AGENT_TOOLS (default-agent-tools.ts)

```
export const DEFAULT_AGENT_TOOLS: Record<string, string[]> = { descriptive: [...], diagnostic: [...], ... };
```
As keys acima. É a fonte do seed (`manifest.ts` lê daqui) e o fallback de `create-mastra` quando a config não traz toolRefs. Inclui as keys tenancy-conditional (o registry as filtra em runtime se faltar tenancy).

### create-mastra-agent-from-config (sem buildToolsFactory)

```
const caps = await resolveAgentCapabilities(systemKey);          // agent.toolRefs ∪ skill.toolRefs
const toolKeys = caps.toolKeys.length > 0 ? caps.toolKeys : (DEFAULT_AGENT_TOOLS[systemKey] ?? []);
const tools = buildToolsFromKeys(toolKeys, ctx);                  // tenancy-skip embutido
if (kbRefs.length) tools.kb_retrieval = createKbRetrievalTool(...);  // inalterado
```
Remove o parâmetro `buildToolsFactory` do input e a chamada `buildToolsFactory(ctx)`. Os 8 adaptadores param de passar `buildXAgentTools`.

### tools-manifest.ts (todas as keys)

Cada entrada `{ key, name, description, category }`, categorias existentes (`data|stats|bqml|canvas|export|memory|rag|external`) + novas se necessário. Keys canônicas (reconciliadas). O manifesto é a fonte do catálogo (aba Tools) e da validação do multi-select.

### Admin UI (AiAgentsTab.tsx)

`MultiRefSelect` de `toolRefs` no editor de agente, populado com `listTools()` do manifesto (key+name). Respeita `origin`/locked como os outros campos. Permite conceder/revogar tools por agente (persistido via o CRUD existente). Mesma UX do `skillRefs`.

## Data flow

```
/api/chat → create-mastra-agent-from-config(systemKey):
   caps = resolveAgentCapabilities(systemKey)            // Firestore: agent.toolRefs ∪ skill.toolRefs
   keys = caps.toolKeys (ou DEFAULT_AGENT_TOOLS[systemKey] se vazio)   // fallback resiliente
   tools = buildToolsFromKeys(keys, ctx)                 // registry: tenancy→null pulado, key desconhecida pulada
   [+ kb_retrieval se kbRefs]
```
Sem `buildToolsFactory`. Tenancy e fail-soft idênticos ao que `buildToolsFromKeys` já faz.

## Error handling

- **Key sem factory no registry:** pulada + warn (existente). Um teste garante que isso não acontece para keys do manifesto/DEFAULT.
- **Tenancy ausente:** factory→`null`, pulada (existente). ADR-0006 preservada.
- **Config indisponível/`toolRefs` vazio:** fallback para `DEFAULT_AGENT_TOOLS[systemKey]`. Agente nunca fica sem tools por falha de config.
- **toolRef inválido na config (admin digitou/colou key inexistente):** pulado + warn; agente roda com o resto.
- **Reseed `--force`:** re-aplica `toolRefs` nos docs `origin:'system'`; preserva edições `origin:'user'` (semântica da Fase 5).

## Testing

- **Registry ↔ manifesto (cobertura):** todas as keys do manifesto têm factory no `TOOL_REGISTRY` e vice-versa (nenhuma órfã dos dois lados).
- **Fidelidade por agente (crítico):** para cada um dos 8, `buildToolsFromKeys(DEFAULT_AGENT_TOOLS[systemKey], ctx)` produz o **mesmo conjunto de keys** que `Object.keys(buildXAgentTools(ctx))` — com tenancy presente e ausente (verifica o filtro server-bound). Garante zero regressão de capacidade.
- **Inline tools movidas:** `read_dashboard_state`/`read_active_filters`/`get_baseline` construídas via registry retornam tool funcional (ex.: `read_dashboard_state.execute()` devolve `ctx.dashboardState`).
- **Chaves canônicas:** `dry_run_sql`/`list_validated_queries` resolvem no registry; `bq_*` antigas não são mais referenciadas (grep).
- **create-mastra:** sem `buildToolsFactory`; config com toolRefs → essas tools; config vazia → DEFAULT; toolRef desconhecido → pulado.
- **Seed:** `agent.toolRefs` = DEFAULT_AGENT_TOOLS por agente; reseed `--force` sobrescreve system, preserva user.
- **UI:** multi-select de toolRefs renderiza do manifesto, salva, respeita locked/origin.
- **Não-regressão:** suíte completa + `pnpm build` verdes; o chat (supervisor + sub-agentes) roda com as tools idênticas ao atual.
- **Run (Docker, operacional):** reseed `--force` + smoke do chat exercitando ao menos um tool por categoria.

## Out of scope (YAGNI)

- Aposentar `buildXAgentTools`/`createXAgent`/orchestrator legado (permanecem).
- Criar tools novas ou alterar a lógica interna de qualquer tool.
- Tools concedidas por skill no seed (mantém `skill.toolRefs: []`; o mecanismo de união fica disponível p/ uso futuro).
- Gating de tool por fase do estado-máquina (ADR-0008) além do que os agentes já fazem.
- Per-tool config além da seleção por key (ex.: parâmetros default por tool).

## Open questions

- Nenhuma bloqueante. O número exato de keys (~50) e a assinatura/contexto de cada factory inline (`get_baseline`) são reconciliados no plano contra os arquivos-fonte; a arquitetura (registry cobre tudo + DEFAULT fallback + fidelidade testada) não muda.
