# Sprint 3.D — Eval Harness: Scorers, Dataset, Drift Detection & Quality Dashboard

**Data**: 2026-05-04
**Sprint**: 3.D (Fase 3 — `business-context-personas-evals`)
**Plano-fonte**: `docs/superpowers/plans/2026-05-04-business-context-personas-evals.md` §6, §7 Fase 3, §6.3, §6.4
**Pré-requisitos**:
- Sprint 1.B — `experimental_telemetry` ativo nos agents (token/cost spans).
- Sprint 1.C — Tabela `liquid_meta.sql_generations` populada por `sql-agent`.
- Sprint 1.D — Dynamic instructions + perfis JSON (`src/shared/config/business-context/{clients,personas}/*.json`).
- Sprint 2.D — Tool `retrieve_business_context` + tabela `embeddings_docs` (pgvector).
**Stack**: AI SDK v6, `@ai-sdk/google-vertex` (`getModel('reasoning')` → `gemini-2.5-pro`), Vitest 4.x, pgvector, BigQuery (`liquid_meta.*`), GitHub Actions.
**ADRs**: ADR-0010 (`adrs/decisions/0010-eval-harness-proprio.md`) — Eval Harness próprio (sem `@mastra/core/evals`) com Drift Detection de LLM-as-Judge. Aceitar e implementar; nenhuma ADR nova é criada nesta sprint.
**Skills**: `test-driven-development`, `verification-before-completion`, `requesting-code-review`.
**Agentes de apoio**: `credit-risk-analyst` (curadoria regulatória do dataset 180 + gold-30), `finance-ux-writer` (revisão dos prompts dos judges), `ux-dashboard-analyst` (`/admin/agent-quality`).

---

## 0. Contexto e decisão

O plano-fonte exige **5 scorers próprios + 3 built-in equivalentes**, **dataset de 180 briefings**, **30 itens gold** para drift de judge, **CI nightly smoke + weekly full**, **dashboard `/admin/agent-quality`** e **output processor `requireCitation`** como guardrail Fase 3. Como o stack atual não usa `@mastra/core/evals` (Mastra é referência conceitual; o runtime é AI SDK v6 + Vertex Gemini via `model-registry.ts`), implementamos uma factory `createScorer` leve seguindo a semântica de `@mastra/core/evals` (`{name, run}` → `ScoreResult`) — ver ADR-0010 (`adrs/decisions/0010-eval-harness-proprio.md`).

Custo estimado (§6.4): 5.400 chamadas/noite no full-180 é inviável diariamente → adotamos **smoke 30 nightly + full 180 weekly**, com cache por `briefingHash` e promoção agressiva de scorers function-based.

---

## 1. File Structure

```
adrs/decisions/
  0010-eval-harness-proprio.md                          (existente, status Accepted nesta sprint)

src/features/evals/
  datasets/
    smoke-30.json                                       (novo — seed inicial / nightly)
    full-180.json                                       (novo — 6 templates × 30 variações)
    gold-30.json                                        (novo — calibração humana)
    schema.ts                                           (novo — Zod schemas)
  scorers/
    index.ts                                            (novo — barrel + registry)
    create-scorer.ts                                    (novo — factory)
    types.ts                                            (novo — Scorer, ScoreResult, EvalRun)
    sql-correctness.ts                                  (novo — function)
    layout-coherence.ts                                 (novo — function + judge)
    persona-fit.ts                                      (novo — judge)
    business-correctness.ts                             (novo — judge regulatório)
    citation-grounding.ts                               (novo — function)
    builtin/
      faithfulness.ts                                   (novo — judge)
      prompt-alignment.ts                               (novo — judge)
      tool-call-accuracy.ts                             (novo — function)
    judges/
      judge-runner.ts                                   (novo — wrapper Vertex + cache)
      rubrics/
        persona-fit.rubric.ts                           (novo — 12 personas)
        business-correctness.rubric.ts                  (novo — CMN/CVM/Lei)
        layout-coherence.rubric.ts                      (novo)
    __tests__/
      sql-correctness.test.ts
      layout-coherence.test.ts
      persona-fit.test.ts
      business-correctness.test.ts
      citation-grounding.test.ts
      faithfulness.test.ts
      prompt-alignment.test.ts
      tool-call-accuracy.test.ts
      create-scorer.test.ts
  runner/
    run-evals.ts                                        (novo — CLI: smoke|full|gold)
    persist.ts                                          (novo — grava liquid_meta.eval_runs)
    cost-budget.ts                                      (novo — §6.4)
    cache.ts                                            (novo — briefingHash → result)
    __tests__/
      run-evals.test.ts
      persist.test.ts
      cost-budget.test.ts
  drift/
    detect-drift.ts                                     (novo — cron mensal)
    baseline-loader.ts                                  (novo — gold-30 humano)
    __tests__/
      detect-drift.test.ts

src/features/ai-agents/
  output-processors/
    require-citation.ts                                 (novo — guardrail)
    __tests__/
      require-citation.test.ts

src/shared/lib/bigquery/
  schemas/
    eval-runs.sql                                       (novo — DDL liquid_meta.eval_runs)
    judge-drift.sql                                     (novo — DDL liquid_meta.judge_drift)

app/(dashboard)/admin/agent-quality/
  page.tsx                                              (novo)
src/pages/admin-agent-quality/
  ui/
    AgentQualityPage.tsx                                (novo)
    ScorerHeatmap.tsx                                   (novo — p50/p95 × scorer × persona × cliente)
    JudgeDriftAlert.tsx                                 (novo)
    JudgeVersionFilter.tsx                              (novo)
  hooks/
    useEvalRuns.ts                                      (novo)
    useJudgeDrift.ts                                    (novo)
  __tests__/
    AgentQualityPage.test.tsx

scripts/
  seed-eval-dataset.ts                                  (novo — geração assistida + validação Zod)
  curate-gold-30.ts                                     (novo — interativo SME)

.github/workflows/
  agent-evals.yml                                       (novo — smoke PR + weekly full + monthly drift)
```

Total: 0 ADRs novas (ADR-0010 já existe), 3 datasets versionados, 8 scorers, 1 factory, 1 runner CLI, 1 drift detector, 1 output processor, 2 schemas BQ, 1 página admin, 2 scripts, 1 workflow.

Convenção de paths (alinhado a ADR-0010 §Implementação): toda a árvore `evals/...` mostrada acima vive em `src/features/evals/...` (exceto `app/(dashboard)/admin/agent-quality/`, `src/features/ai-agents/output-processors/`, `src/shared/lib/bigquery/schemas/`, `scripts/` e `.github/workflows/`).

---

## 2. Tipos canônicos

```ts
// src/features/evals/scorers/types.ts
export type ScoreResult = {
  score: number              // 0..1
  rationale?: string
  metadata?: Record<string, unknown>
  passed?: boolean           // opcional, para function-based binários
}

export type ScorerInput = {
  briefing: BriefingFixture
  agentOutput: AgentOutput   // { sql?, layout?, narrative?, toolCalls? }
  context: { clientId: ClientId; personaId: PersonaId; macroAsOf: string }
}

export type Scorer = {
  name: string
  kind: 'function' | 'judge' | 'hybrid'
  judgeModelVersion?: string // só para kind ∈ {judge, hybrid}
  // ADR-0010 nomeia o método como `run`. Mantemos `run` como nome canônico
  // e `evaluate` como alias deprecado para suavizar transição em call-sites.
  run: (input: ScorerInput) => Promise<ScoreResult>
  /** @deprecated use `run` */
  evaluate?: (input: ScorerInput) => Promise<ScoreResult>
}

export type BriefingFixture = {
  id: string                 // ex: "smoke-001"
  templateId: 1|2|3|4|5|6
  personaId: PersonaId
  clientId: ClientId
  briefing: string
  expectedKpis: string[]
  expectedVisuals: string[]
  expectedTopics: string[]
  expectedRegulatory?: Array<'CMN_2682'|'CVM_60'|'Lei_13786'|'CMN_4676'|'IFRS_9'>
  goldScores?: Partial<Record<ScorerName, number>> // só em gold-30
}

export type EvalRun = {
  runId: string
  startedAt: string
  finishedAt: string
  suite: 'smoke'|'full'|'gold'
  judgeModelVersion: string
  glossaryVersion: string
  regulatoryPackVersion: string
  results: Array<{
    fixtureId: string
    scorerName: string
    score: number
    rationale?: string
    durationMs: number
    tokensIn?: number
    tokensOut?: number
    costUsd?: number
    // Multi-tenancy (ADR-0006): clientId e personaId são propagados em
    // metadata de TODO run para isolamento estrito e auditabilidade.
    clientId: ClientId
    personaId: PersonaId
  }>
  totals: { p50: Record<string, number>; p95: Record<string, number>; costUsd: number }
}
```

---

## 3. Tasks (TDD)

> Cada task segue Red → Green → Refactor com `superpowers:test-driven-development`. Comandos: `pnpm vitest run src/features/evals/` (cobertura ≥85% por arquivo). Vitest 4.x.

### Task 1 — Tipos canônicos + alinhamento ADR-0010

**Red**: criar `src/features/evals/scorers/types.ts` exportando os 4 tipos acima; teste de compilação `pnpm tsc --noEmit`.
**Green**: definições conforme §2; nomes de campos compatíveis com `Scorer` de ADR-0010 (`run` é alias preservado de `evaluate`; ambos exportados durante migração).
**Refactor**: revisar ADR-0010 (mover de `Proposed` → `Accepted` ao final da sprint após pilot do smoke nightly + 30 gold) com `credit-risk-analyst`. Nenhuma ADR nova é criada.
**DoD**: `tsc --noEmit` passa; ADR-0010 promovida a `Accepted`.

### Task 2 — `createScorer` factory

**Red**: `src/features/evals/scorers/__tests__/create-scorer.test.ts` — verifica nome obrigatório, `run` chamada, retorno tipado, captura erro → `score: 0, rationale: 'run threw: ...'`.
**Green**: `createScorer({name, kind, run})` retornando `Scorer` com try/catch + telemetria via `experimental_telemetry`. Factory carimba automaticamente `judgeModelVersion`, `glossaryVersion`, `regulatoryPackVersion`, `clientId` e `personaId` em metadata.
**Refactor**: extrair `withTelemetry` HOF; carimbar `judgeModelVersion` automaticamente para kind judge/hybrid via `EVAL_JUDGE_MODEL` (ADR-0010).
**DoD**: 100% branch coverage no factory.

### Task 3 — Scorer `sql_correctness` (function)

**Red**: 6 fixtures SQL em `__fixtures__/sql/`:
1. Bom: `SELECT contrato_id, ... FROM contratos WHERE data_competencia >= '2024-01-01'` → 1.0
2. Ruim: `SELECT * FROM contratos` → ≤0.3
3. Ruim: `... CROSS JOIN ...` → ≤0.3
4. Ruim: sem partition filter → ≤0.5
5. Ruim: dry-run estima >100GB → ≤0.4
6. Bom: agregação com partition + colunas explícitas → 1.0

**Green**: implementação chama BigQuery `dryRun: true`, parseia SQL com regex AST simples (`SELECT *`, `CROSS JOIN`, ausência de `data_competencia`), pondera 4 sub-scores: `[parsePass, partitionFilter, bytesReasonable, noAntipattern]`.
**Refactor**: limite `bytesReasonable` configurável por cliente; reuso de `liquid_meta.sql_generations` para amostragem histórica de bytes.
**DoD**: 6 fixtures todos os assert; cobertura ≥90%.

### Task 4 — Scorer `layout_coherence` (function + judge)

**Red**: 5 layouts JSON fixtures (3 bons, 2 ruins). Asserts: KPIs primeiro (top 1-2 blocos), 3-5 blocos, cobertura `priority_kpis` ≥0.8, visuais ⊂ `preferred_visuals` da persona.
**Green**: parte function calcula 4 sub-métricas; parte judge avalia "narrativa do layout" via Vertex (`getModel('reasoning')`) com structured output `{score:0..1, rationale}`. Score final = média ponderada `0.7*function + 0.3*judge`.
**Refactor**: rubrica em `rubrics/layout-coherence.rubric.ts`; cache por `hash(layoutJson + personaId)`.
**DoD**: 5 fixtures pass; judge prompt revisado por `finance-ux-writer`.

### Task 5 — Scorer `persona_fit` (judge)

**Red**: 4 outputs por persona × 12 personas = 48 fixtures (subset 12 inicialmente). Assertion: persona errada → score ≤0.4; persona certa com jargão correto → ≥0.8.
**Green**: rubrica por persona em `rubrics/persona-fit.rubric.ts` (CEO, CFO, Diretor FII, Controller, etc.) com critérios `{language, jargon, granularity, horizon}`. Prompt template injeta rubrica + output do agente; structured output Zod `{score, rationale, breakdown:{language,jargon,granularity,horizon}}`.
**Refactor**: prompt cache via `google.cachedContent` para rubrica (estável); judge é `gemini-2.5-pro`.
**DoD**: matriz 12×4 ≥80% precisão vs gold.

### Task 6 — Scorer `business_correctness` (judge regulatório)

**Red**: 8 fixtures cobrindo CMN 2.682 (buckets/provisões), CVM 60 (regime fiduciário), Lei 13.786 (retenção 25/50%), IFRS 9 (3 estágios). Detectar: número errado de provisão, citação errada de norma, alucinação ("Lei 13.786 art. 99" inexistente).
**Green**: contexto regulatório injetado a partir de chunks RAG (Sprint 2.D, namespace `regulatorio`). Judge recebe output do agente + 5 chunks RAG normativos + checklist de claims. Output Zod `{score, rationale, hallucinations[]}`.
**Refactor**: cache por `hash(output + chunkIds)`; lista negra de citações (números de artigo inexistentes).
**DoD**: 8 fixtures pass; revisão por `credit-risk-analyst`.

### Task 7 — Scorer `citation_grounding` (function)

**Red**: 6 outputs com afirmações regulatórias/numéricas. Cada `claim` tipo regulatório/numérico precisa ter `source_doc` apontando para chunk em `embeddings_docs`. Fixtures: 3 com source válido, 3 sem ou com source inexistente.
**Green**: parser regex detecta padrões `(Lei|CMN|CVM|Res\.|Art\.|\d+%|R\$\s*\d+|\d{2,}\s*(bps|p\.?p\.?))`. Para cada claim, exige campo `source_doc` no output JSON do agente; valida `SELECT 1 FROM embeddings_docs WHERE doc_id = $1` (pgvector). Score = `validClaims / totalClaims`.
**Refactor**: whitelist de termos comuns ("PDD", "DSCR" sem número exato) para evitar falso-positivo (mitigação §Riscos).
**DoD**: 6 fixtures pass; whitelist documentada.

### Task 8 — Built-in scorers leves

**Red**: 1 fixture happy + 1 fixture failure por scorer.
- `faithfulness`: judge avalia se output cita apenas fatos suportados pelo briefing+RAG.
- `prompt-alignment`: judge avalia aderência ao system prompt dinâmico (persona/cliente).
- `tool-call-accuracy` (function): valida que `toolCalls[]` chamou ferramentas esperadas (`lookup_glossary`, `retrieve_business_context`, etc.) com argumentos válidos.

**Green**: implementação seguindo specs Mastra (`adrs/mastra/evals/`) em ~80 LOC cada.
**Refactor**: reutilizar `judgeRunner` da Task 5; `tool-call-accuracy` reusa schema Zod das tools.
**DoD**: 6 fixtures pass.

### Task 9 — Dataset 180 briefings

**Red**: `src/features/evals/datasets/schema.ts` exporta Zod `BriefingFixtureSchema`; teste valida que `smoke-30.json` (seed inicial 30) parseia 100%.
**Green**: 30 briefings curados manualmente pelo `credit-risk-analyst` (5 por template × 6 templates), distribuídos em 12 personas × 4 clientes amostrais. Estrutura `{personaId, clientId, briefing, expectedKpis[], expectedVisuals[], expectedTopics[], expectedRegulatory[]}`.
**Refactor**: `scripts/seed-eval-dataset.ts` gera 150 variações adicionais via Vertex (template + jitter de números, prazos, termos), validadas por SMEs (revisão cruzada por 2 SMEs — mitigação viés). Salva `full-180.json`.
**DoD**: 180 fixtures parseiam; rotação trimestral documentada.

### Task 10 — Dataset gold-30

**Red**: `gold-30.json` parseia; cada fixture tem `goldScores` com 5+ scorers anotados (0..1) por SMEs.
**Green**: `scripts/curate-gold-30.ts` (CLI interativo): SME vê briefing + agent output, atribui score por scorer com rationale. Persiste em JSON + commit no git.
**Refactor**: 30 itens cobrem 6 templates × 5 cenários (happy, persona errada, alucinação numérica, alucinação regulatória, layout incoerente).
**DoD**: 30 fixtures com goldScores completos para 5 scorers próprios; revisão cruzada 2 SMEs.

### Task 11 — Runner `src/features/evals/runner/run-evals.ts`

**Red**: testes `run-evals.test.ts` — `--suite=smoke` carrega 30, `--suite=full` carrega 180, `--suite=gold` carrega 30 com goldScores; agrega p50/p95; persiste em `liquid_meta.eval_runs`.
**Green**: CLI commander; paraleliza com `p-limit(8)`; coleta tokens/custo via `experimental_telemetry`; cache via `src/features/evals/runner/cache.ts` (key = `sha256(briefingId + scorerName + judgeModelVersion + glossaryVersion + regulatoryPackVersion)`); flush para BQ via `persist.ts`.
**Refactor**: progress bar; resume parcial em falha (idempotente por hash).
**DoD**: smoke completa em <8min CI (mock Vertex em test); full <45min (test usa subset).

### Task 12 — Schemas BigQuery

```sql
-- liquid_meta.eval_runs
CREATE TABLE liquid_meta.eval_runs (
  run_id STRING NOT NULL,
  started_at TIMESTAMP NOT NULL,
  finished_at TIMESTAMP,
  suite STRING NOT NULL,        -- smoke|full|gold
  judge_model_version STRING NOT NULL,
  glossary_version STRING NOT NULL,
  regulatory_pack_version STRING NOT NULL,
  fixture_id STRING NOT NULL,
  scorer_name STRING NOT NULL,
  score FLOAT64 NOT NULL,
  rationale STRING,
  duration_ms INT64,
  tokens_in INT64, tokens_out INT64, cost_usd FLOAT64,
  persona_id STRING, client_id STRING
)
PARTITION BY DATE(started_at)
CLUSTER BY suite, scorer_name, persona_id;

-- liquid_meta.judge_drift
CREATE TABLE liquid_meta.judge_drift (
  detected_at TIMESTAMP NOT NULL,
  judge_model_version STRING NOT NULL,
  scorer_name STRING NOT NULL,
  fixture_id STRING NOT NULL,
  judge_score FLOAT64 NOT NULL,
  human_baseline FLOAT64 NOT NULL,
  delta FLOAT64 NOT NULL,
  alert BOOL NOT NULL,          -- |delta| ≥ 0.1
  rolling_3m_avg_delta FLOAT64
) PARTITION BY DATE(detected_at);
```

**DoD**: DDLs aplicados em `liquid_meta`; permissões IAM revisadas.

### Task 13 — CI workflow `.github/workflows/agent-evals.yml`

**Red**: workflow lint via `actionlint`.
**Green**:
- `smoke` job: `on: pull_request` com `paths: ['src/features/ai-agents/**','src/features/canvas-orchestrator/**','src/shared/config/agents/**','src/shared/config/business-context/**','src/features/ai-agents/tools/**','src/features/evals/**']` → `pnpm tsx src/features/evals/runner/run-evals.ts --suite=smoke`. Falha PR se p50 de qualquer scorer <0.7. Tempo-alvo <8min.
- `full` job: `on: schedule: cron: '0 2 * * 1'` (segunda 02h UTC) → suite=full. Posta resumo em Slack. Tempo-alvo <45min.
- `drift` job: `on: schedule: cron: '0 3 1 * *'` (mensal dia 1 03h UTC) → roda gold-30 + `src/features/evals/drift/detect-drift.ts`.

**Refactor**: secrets `VERTEX_*` via OIDC; cache `pnpm` + cache de embeddings.
**DoD**: smoke roda em <8min; full <45min; budget alerta se nightly >$X (env `EVAL_DAILY_BUDGET_USD`).

### Task 14 — Drift detector

**Red**: `detect-drift.test.ts` — dada gold-30 com `goldScores` humanos e judge run sintético com delta 0.15 em 5 itens, gera alerta; com delta 0.05 não gera.
**Green**: `src/features/evals/drift/detect-drift.ts` — carrega `gold-30.json`, executa runner suite=gold, computa `delta = judge - human` por fixture×scorer, calcula média móvel 3m via consulta a `liquid_meta.judge_drift`. Threshold absoluto `|delta| ≥ 0.1` (env `EVAL_DRIFT_THRESHOLD`) OU desvio `σ > 2` (env `EVAL_DRIFT_SIGMA`) → `alert: true`. Persiste em `liquid_meta.judge_drift`.
**Refactor**: notifica via Slack webhook; abre issue GitHub automática se alerta.
**DoD**: detecta drift sintético com 100% recall em testes; mensagem de alerta inclui rationale.

### Task 15 — Dashboard `/admin/agent-quality`

**Red**: `AgentQualityPage.test.tsx` — renderiza heatmap, filtro de `judgeModelVersion`, alerta drift se houver row em `judge_drift` com `alert=true` últimos 30d.
**Green**:
- `useEvalRuns({suite, days=30})` → BQ query agregada `p50/p95` por scorer×persona×cliente.
- `ScorerHeatmap`: matriz scorer × persona com cores OKLch (verde 1.0 → vermelho 0.5); tooltip com p95.
- `JudgeDriftAlert`: banner se drift ativo com link "Recalibrar judge" (abre runbook).
- `JudgeVersionFilter`: dropdown alimentado por `DISTINCT judge_model_version`.

**Refactor**: revisão de UX por `ux-dashboard-analyst`; export PDF via `jspdf` reusando padrão do projeto.
**DoD**: página acessível em `/admin/agent-quality`; permissão restrita a role `admin` via Firebase Auth (`src/features/auth/`) + custom claim `admin: true`; usuário não-admin recebe 403; tests passam.

### Task 16 — Output processor `requireCitation`

**Red**: `require-citation.test.ts` — output com claim regulatória sem `source_doc` é rejeitado; com `source_doc` válido passa; whitelist `PDD`/`DSCR` (sem número) passa.
**Green**: `src/features/ai-agents/output-processors/require-citation.ts` — implementa interface AI SDK `experimental_output` post-processor. Reusa parser do scorer `citation_grounding`. Modo `enforce` (default em prod) bloqueia; modo `soft` (rollout) loga warning.
**Refactor**: feature flag `OUTPUT_PROCESSOR_CITATION_MODE=enforce|soft|off`; regression test garante que rollout não quebra fixtures históricos.
**DoD**: integrado nos 4 agentes (sql, layout, analyst, descriptive); regression test verde.

### Task 17 — Cost budget alert

**Red**: `cost-budget.test.ts` — dado run estimado em $50 e budget $30, gera alerta; abaixo do budget passa.
**Green**: `evals/runner/cost-budget.ts` — pré-estima `tokens_in*price_in + tokens_out*price_out` por scorer (usa média histórica de `liquid_meta.eval_runs`); compara com `EVAL_DAILY_BUDGET_USD`. Bloqueia execução se >120% do budget; alerta se >100%.
**Refactor**: tabela de preços Vertex versionada; recomputa mensalmente.
**DoD**: alerta funciona em CI; budget aprovado documentado em `evals/README.md`.

---

## 4. Acceptance Criteria

- [ ] 5 scorers próprios + 3 built-in implementados, com testes Vitest e cobertura **≥85%** por arquivo.
- [ ] `src/features/evals/datasets/{smoke-30,full-180,gold-30}.json` versionados em git; todos parseiam contra `BriefingFixtureSchema`.
- [ ] gold-30 tem `goldScores` para 5 scorers próprios, revisado por 2 SMEs (assinatura no commit).
- [ ] Smoke (30) executa em **<8min** no CI em PRs alterando `src/features/ai-agents/**`, `src/shared/config/business-context/**`, ou `src/features/ai-agents/tools/**`.
- [ ] Full (180) executa em **<45min** weekly (segunda 02h UTC) e persiste em `liquid_meta.eval_runs`.
- [ ] Drift detector roda gold-30 mensalmente (dia 1 03h UTC); alerta se `|delta| ≥ 0.1` ou desvio σ>2; persiste em `liquid_meta.judge_drift`.
- [ ] Dashboard `/admin/agent-quality` mostra runs últimos 30 dias com filtro `judgeModelVersion`; banner de drift ativo se aplicável.
- [ ] Output processor `requireCitation` integrado nos 4 agentes em modo `enforce`; regression test bloqueia output sem `source_doc` em afirmação regulatória.
- [ ] Custo nightly estimado **pré-execução** (não pós-fato) e dentro de `EVAL_DAILY_BUDGET_USD`; alerta automático se >100%; bloqueio se >120%.
- [ ] ADR-0010 (`adrs/decisions/0010-eval-harness-proprio.md`) promovida de `Proposed` → `Accepted` com revisão de `credit-risk-analyst` ao final da sprint.
- [ ] **Multi-tenancy (ADR-0006)**: `clientId` e `personaId` carimbados em metadata de **todo** EvalRun (BQ + JSON); teste verifica isolamento por tenant.
- [ ] **PII regression**: dataset adversarial com 30 outputs históricos roda no CI smoke; **0 vazamentos PII** (CPF/CNPJ/RG/email) em rationales/logs antes de persistir em BQ — reusa scrubber Sprint 1.D §3.1.
- [ ] Vitest **4.x** declarado em `package.json` devDependencies; `pnpm lint` + `pnpm tsc --noEmit` + `pnpm vitest run src/features/evals` verdes.

---

## 5. Riscos e mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Judge LLM caro (5.4k chamadas/noite full) | Alta | Alto | Smoke 30 nightly + full 180 weekly; cache por `briefingHash`; promover function-based scorers; budget alert (Task 17). |
| Dataset SME viesado | Média | Alto | Revisão cruzada por 2 SMEs; rotação trimestral; jitter automático em `seed-eval-dataset.ts`. |
| Drift de judge mascarado por flutuação natural | Média | Médio | 30 gold + média móvel 3 meses + sigma threshold (σ>2); ADR-0010 documenta. |
| `requireCitation` falso-positivo (rejeita output válido) | Alta no rollout | Alto | Whitelist de termos comuns; modo `soft` em rollout antes de `enforce`; regression test sobre 30 outputs históricos. |
| `embeddings_docs` indisponível em CI | Baixa | Médio | Mock pgvector via fixtures locais; flag `CITATION_GROUNDING_OFFLINE=true` em CI. |
| Mudança de `glossary_version` ou `regulatory_pack_version` invalida histórico | Média | Médio | Cache key inclui ambas as versões; runner detecta mudança e re-executa baseline gold-30. |
| `@mastra/core/evals` evolui e diverge da nossa factory | Baixa | Baixo | ADR-0010 documenta trade-off; revisão semestral; interface `Scorer` mantida compatível com `adrs/mastra/evals/create-scorer.mdx`. |
| Vertex `gemini-2.5-pro` quota exhaustion no full weekly | Média | Alto | `p-limit(8)` paralelismo controlado; retry exponencial; fallback para `gemini-2.5-flash` em caso de 429 (degrada qualidade — alerta). |

---

## 6. Self-Review Checklist

- [ ] Cada task tem Red → Green → Refactor explícito com fixtures concretas.
- [ ] Pré-requisitos (Sprint 1.B/1.C/1.D/2.D) validados antes do start (`grep` em `src/features/ai-agents/`, `liquid_meta.sql_generations`, `embeddings_docs`).
- [ ] Tipos canônicos (§2) consistentes com plano-fonte §6.5 (`Mastra.scorers` → `scorers/index.ts` registry).
- [ ] Datasets versionados em git, não em BQ (auditabilidade + diff em PR).
- [ ] `judgeModelVersion`, `glossaryVersion`, `regulatoryPackVersion` carimbados em **todo** EvalRun (plano §5, §6.3).
- [ ] Cache de scorers respeita versionamento (key inclui as 3 versões).
- [ ] Output processor `requireCitation` tem feature flag e rollout gradual (soft → enforce).
- [ ] Custo budget é **pré**-estimado, não pós-fato — bloqueia execução se >120%.
- [ ] Dashboard tem permissão `admin` (não vaza scores/rationales para usuários comuns).
- [ ] PII scrubbing aplicado em rationales antes de persistir em BQ (reusa scrubber de Sprint 1.D §3.1).
- [ ] Skills `verification-before-completion` invocada antes de marcar task como Done.
- [ ] `requesting-code-review` invocada para promoção de ADR-0010 (`Proposed`→`Accepted`) e prompts dos judges.
- [ ] Workflow CI testado em branch antes de merge (dry-run com `act` ou branch protegida).
- [ ] Runbook "Recalibrar judge" criado em `docs/runbooks/judge-recalibration.md` (referenciado pelo dashboard).
- [ ] Rotação trimestral de SMEs documentada em `src/features/evals/README.md`.

---

**Entrega**: `/Users/giullianosoares/Projects/liquid-play-dataviz/docs/superpowers/specs/2026-05-04-sprint3-D-evals-scorers-dataset.md`
