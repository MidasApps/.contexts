# Mastra Workflows + Agent Network — Plano de Adoção para o Dashboard Builder

**Data:** 2026-05-04
**Escopo:** `src/features/canvas-orchestrator` (Dashboard Builder, gemini-2.5-pro, 23 tools) e `src/features/ai-agents` (Orchestrator analítico, 8 sub-agentes-tools + `generate_pdf` + `generate_csv` = 10 tools).
**Refs lidas:** `adrs/mastra/workflows/{workflow,step}.mdx`, `workflow-methods/{parallel,branch,foreach}.mdx`, `adrs/mastra/agents/network.mdx` (deprecated → supervisor agents), `adrs/vercel-ai-sdk.md` §4.3 (multi-step, `prepareStep`, `dynamicTool`, `stopWhen`, tool approval).

---

## 1. Diagnóstico

O Canvas Orchestrator hoje é uma única chamada `streamText` com `stopWhen: stepCountIs(30)` e 23 tools de granularidade desigual (planejamento, contexto, escrita no canvas). O modelo decide a ordem em runtime — funciona, mas tem limites estruturais que não dependem de paralelismo:

- **Paralelismo já é suportado.** O AI SDK permite que o modelo emita N tool calls num mesmo turno, executadas em paralelo pelo runtime. O prompt em `fill-block.ts:102` já instrui o modelo nesse sentido. O problema real é duplo: (a) **garantia** de que o modelo emite tool calls paralelas é probabilística — depende da qualidade do prompt e da forma das tools; e (b) **lógica de geração de SQL, validação e branching** vive dentro do loop do modelo, onde não temos `Promise.allSettled` determinístico, retry granular por slot, error handling estruturado nem branches condicionais confiáveis.
- **Drift de plano.** Sem etapas formais, o modelo às vezes "esquece" de declarar layout antes de preencher, ou re-consulta schemas já vistos. `stepCountIs(30)` é teto, não estrutura.
- **Branching implícito.** "BQML disponível? usar `ML.FORECAST`" e "cliente=OM → persona X" ficam diluídos no system prompt, não verificáveis em teste.
- **Sem retry estruturado por slot.** SQL inválido volta como tool-error e o modelo tenta livremente; não há `dountil(valid, max=3)` por bloco.

**Motivação real para uma state-machine:** disciplina arquitetural — tornar o pipeline `plan → gather → layout → fill → validate → render` explícito, tipado, testável, idempotente por step e cancelável globalmente. O ganho de wall-clock vem como consequência de mover orquestração para código TS, não de "vencer serialização que não existe".

---

## 2. Mapa de fluxos do Dashboard Builder

**Linear (espinha):**
`briefing → plan_analysis → gather_context → declare_layout → fill_blocks → cross_validate → render_commit`

**Paralelo dentro de `gather_context`:**
- `fetch_table_schema` ‖ `fetch_sample_data` ‖ `fetch_filter_options` ‖ `load_persona(client)` ‖ `probe_bqml_models` ‖ `load_glossary` → join.

**Paralelo dentro de `fill_blocks` (`foreach` com concurrency cap):** por slot:
1. `pick_indicator` → 2. `generate_sql` (gemini-flash, schema-aware) → 3. `validate_sql` (`dountil` até `EXPLAIN` passar, max 3) → 4. `pick_visualization` → 5. `materialize_block`.

**Branches condicionais:**
- `branch([bqmlAvailable && isForecastIntent, useBqmlStep], [else, useSqlStep])`.
- `branch([client==='OM', loadOmPersona], …)` — hoje em `useEffect`; explicitar como step torna testável fora do navegador.
- `branch([blockKind==='table', wideQueryStep], [blockKind==='kpi', singleValueStep], [blockKind==='chart', timeSeriesStep])`.

---

## 3. Mapeamento Mastra ⇄ AI SDK v6

| Mastra primitive | Equivalente AI SDK / TS puro | Nota |
|---|---|---|
| `createWorkflow().then(s)` (top-level, `@mastra/core/workflows`) | função `async` chamando steps em ordem | trivial |
| `.parallel([a,b])` | `Promise.allSettled([a(),b()])` | usar `allSettled` p/ partial success |
| `.foreach(step,{concurrency:N})` | `pLimit(N)` + `Promise.allSettled` | precisa lib (`p-limit`) |
| `.branch([[cond,step]…])` | `if/switch` ou tabela de despacho | trivial |
| `.dountil(step,cond)` | loop `while` com `maxAttempts` | trivial |
| `createStep({inputSchema,outputSchema,execute})` (top-level) | função tipada + `zod.parse` | sem snapshot |
| `run.suspend()/resume()` | **não tem** equivalente AI SDK | requer persistência |
| `Agent.network()` (deprecated, ver `adrs/mastra/agents/network.mdx:14-18`) | supervisor agent = `streamText` com sub-agents-as-tools (já fazemos) | referência decorativa |
| `prepareStep` (AI SDK) | controla `activeTools`/`toolChoice`/`model` por **step interno** do `streamText` (não por step do workflow externo) | usar dentro de cada `streamText` |
| `dynamicTool` (AI SDK) | tools em runtime na step | quando set depende de contexto (ex.: indicators registry) |

**Decisão recomendada:** **não adotar `@mastra/core` agora**. Os ganhos (workflows, snapshots, observability UI, cron) são reais, mas: (1) acoplamento a runtime extra; (2) reescreveria toda a camada de tools; (3) o valor central (steps formais + paralelismo determinístico) cabe em **350-500 LOC** de TS sobre o AI SDK quando incluímos: tipagem genérica encadeada (input do step N = output do step N-1), error handling com agregação, `AbortSignal` propagado, validação Zod entre steps, `dountil` com max-attempts, `foreach` com concurrency cap. A mini state-machine espelha a forma Mastra (`createStep`, `.then`, `.parallel`, `.foreach`, `.branch`, `.dountil`) — port futuro é mecânico.

---

## 4. Redesenho do Canvas Orchestrator (Mastra-style)

```ts
// pseudo-código — não-produção
const buildDashboard = workflow('build-dashboard')
  .then(planStep)            // gemini-pro: briefing → intents[]
  .then(gatherContextStep)   // parallel: schema, sample, persona, bqml, glossary
  .then(designLayoutStep)    // gemini-pro determinista: declare_layout
  .then(fillBlocksStep)      // foreach(slot, {concurrency:3})
  .then(crossValidateStep)
  .then(renderCommitStep);
```

```ts
const fillSlot = workflow('fill-slot')
  .then(pickIndicatorStep)
  .branch([
    [({intent}) => intent.kind==='forecast' && ctx.bqml, useBqmlStep],
    [() => true, generateSqlStep],
  ])
  .dountil(validateSqlStep, ({attempts, ok}) => ok || attempts>=3)
  .then(pickVizStep)
  .then(materializeBlockStep);
```

Steps usam **AI SDK por dentro**:
- `planStep`/`pickVizStep`: `generateText` + `Output.object()` (Zod).
- `generateSqlStep`: `generateText` (gemini-flash) com tools pequenas (`get_columns`, `sample_values`); `prepareStep` controla `activeTools`/`toolChoice` no loop interno do `streamText`.
- `validateSqlStep`: chamada determinística ao BQ (`EXPLAIN` ou `dryRun`).

Cada step é testável isoladamente (input/output Zod). O orchestrator de topo vira pipeline previsível; o modelo só decide **dentro** dos steps onde decisão é o ponto.

### Concorrência, retry e cancelamento

- **Multi-tenancy obrigatório.** Cada step do workflow recebe `requestContext` contendo `clientId` (OM/BRZ/CONX/IMCASA) propagado do entrypoint. Tools que tocam BQ, vector store ou working memory leem o `clientId` do contexto, **não** de globals — vazamento cross-tenant é falha de auditoria. Steps paralelos (`parallel`, `foreach`) replicam o contexto a cada execução; ausência de `clientId` faz o step falhar fechado com erro tipado.
- **Rate limit Vertex Gemini.** Disparar 6 `generateText` simultâneos arrisca 429/`RESOURCE_EXHAUSTED`. Aplicar `p-limit` com cap conservador (ex.: 3) no `foreach` e reusar `withRetry` (`src/features/ai-agents/lib/with-retry.ts`, já usado em `fill-block.ts:124` e `create-agent-tool.ts:100`) que faz backoff exponencial em 429/503/`quota`. Não reinventar.
- **Idempotência e partial success.** `fillSlot` é idempotente por `slotId` — re-execução com mesmo input produz mesmo bloco (ou falha do mesmo modo). `foreach` usa `Promise.allSettled` + agregação: slots falhos marcam erro local sem abortar build; UI exibe placeholder e oferece retry pontual.
- **Cancelamento.** `AbortSignal` global criado no entrypoint do workflow é propagado a cada step (e daí a cada `generateText`/BQ client). Usuário fecha chat → signal aborta, pendentes não são commitados, in-flight são interrompidos no próximo yield-point.

---

## 5. Agent Network ⇄ Orchestrator Analítico

Mastra `Agent.network` está **deprecated** (ver `adrs/mastra/agents/network.mdx:14-18`, "use supervisor agents") — mantemos a menção apenas como referência decorativa. O orchestrator analítico (`src/features/ai-agents/orchestrator.ts`) já é supervisor: 8 sub-agentes expostos como tools.

Melhorias com valor real:
- **Tool-piping declarativo.** Após cada tool, anexar `system` chunk via `prepareStep` sugerindo próximo passo (ex.: `"considere chamar diagnostic_agent"`) — sem tirar autonomia.
- **`activeTools` por fase** dentro do `streamText`: começar só com `descriptive`/`comparative`; após primeira saída, liberar `diagnostic`/`predictive`. Reduz alucinação e tokens (lista menor = prompt menor).
- **Compactação.** `prepareStep` poda `messages.slice(-10)` + summary do step anterior.

Manter supervisor + melhorias é o sweet spot — workflow puro perderia flexibilidade conversacional.

---

## 6. Plano de adoção em fases

**Fase 1 — Paralelismo no fill_blocks (1 semana, zero-Mastra).**
- Extrair `fill_block` em função pura `fillBlock(slot, ctx, signal)`.
- Após `declare_layout`, rodar `Promise.allSettled(slots.map(s => limit(() => fillBlock(s,ctx,signal))))` **fora do loop AI SDK**, com `p-limit(3)` e `withRetry` por slot.
- Instrumentar `experimental_telemetry` (AI SDK) para p50/p95 wall-clock por step e tokens por sub-agente — KPI baseline.
- Manter o supervisor para conversação; só blocos paralelos.
- Risco: baixo.

**Fase 2 — Workflow interno tipado (2 semanas).**
- Criar `src/features/canvas-orchestrator/workflow/` com `createStep`, `runWorkflow`, `parallel`, `foreach(concurrency)`, `branch`, `dountil`, tipagem encadeada genérica, `AbortSignal`, validação Zod entre steps. **350-500 LOC**.
- Migrar Canvas Orchestrator para o pipeline da §4.
- `streamText` apenas dentro de steps que precisem (planStep, generateSqlStep) — não no topo.
- `prepareStep` interno por fase para `activeTools`.
- Branches BQML e blockKind explícitos.
- Feature-flag `useWorkflowOrchestrator` no app-store.
- Risco: médio (caminho crítico).

**Fase 3 — Supervisor melhorado para analítico (1–2 semanas, paralelizável).**
- `prepareStep` no orchestrator analítico para tool-gating + compactação.
- Hint structures pós-tool.
- Telemetria por sub-agente (tempo, tokens, retry rate).
- Risco: baixo.

**Fase 4 (opcional) — Avaliar `@mastra/core`.**
- Se Fase 2 mostrar valor em snapshots/observability/cron, portar — port mecânico se Fase 2 manteve o shape da API.

---

## 7. Recomendação final

**Adotar mini-workflow interno (Fase 1+2), manter AI SDK como motor, não adotar `@mastra/core` agora, ignorar `Agent.network` (deprecated).**

- **Hipótese de ganho a validar:** ao paralelizar `fill_blocks` fora do loop do modelo com `Promise.allSettled` + `p-limit(3)`, esperamos redução de latência p50 em builds com ≥4 blocos, proporcional a N e à razão tempo-modelo/tempo-BQ. **KPI medido antes/depois** via `experimental_telemetry` instrumentada na Fase 1; sem essa medição, o ganho não é validável.
- **Custo de tokens.** Paralelismo reduz wall-clock mas pode **aumentar tokens** (cada sub-agente carrega seu system prompt). Mitigar via prompt cache do Vertex (`cachedContent` em system prompts estáveis dos sub-agentes) — economia significativa quando o mesmo sub-agente é invocado para múltiplos slots no mesmo build.
- **Ganhos qualitativos independentes do KPI:** menos drift (steps formais), branches BQML/cliente verificáveis em teste, retry granular por slot, partial success real, cancelamento global.
- **Risco controlado:** sem dependência nova, sem reescrita de tools, feature-flag protege rollout, `withRetry` reaproveitado.
- **Reversibilidade:** port para `@mastra/core` direto — `createStep` espelha API top-level (`@mastra/core/workflows`).
- **Custo:** ~3 semanas (Fase 1+2); Fase 3 paralela.

Risco residual: a mini-lib pode virar "framework caseiro". Mitigação: limitar a 6 primitives (`step`, `then`, `parallel`, `foreach`, `branch`, `dountil`), sem suspend/resume/persistência — se precisar disso, é o sinal para migrar para Mastra real.
