---
id: 0010
title: Eval harness próprio (sem `@mastra/core/evals`) com drift detection de LLM-as-judge
status: Accepted
date: 2026-05-04
accepted_at: 2026-05-04
deciders: [giulliano.soares]
consulted: [time-ai, time-data, credit-risk-analyst]
informed: [time-eng, compliance]
tags: [evals, qualidade, llm-as-judge, ci, drift, scorers]
supersedes: []
related: [0002, 0006]
---

# ADR-0010 — Eval harness próprio com drift detection de LLM-as-judge

## Status

`Accepted` — desde 2026-05-04.

Histórico:
- 2026-05-04 — proposta.
- 2026-05-04 — aceita após revisão cruzada com planos macro, specs Sprint 1-3 e ADRs relacionadas.
  smoke nightly.

## Contexto

O plano `2026-05-04-business-context-personas-evals.md` §6 estabelece a necessidade
de evals para o Dashboard Builder e o Orchestrator Analítico com **5 scorers
próprios** (`sql_correctness`, `layout_coherence`, `persona_fit`,
`business_correctness`, `citation_grounding`) e **3 built-in equivalentes**
(`faithfulness`, `prompt-alignment`, `tool-call-accuracy`). O custo regulatório de
alucinação é alto: gestores de FII e compliance descartam o produto no primeiro
erro factual.

Forças:

- **ADR-0002**: Mastra-as-library, não Mastra full. `@mastra/core/evals` faz parte
  do runtime full e tem suposições sobre `Agent` lifecycle. Importar parcialmente é
  arriscado.
- **Customização necessária**: scorers próprios precisam de hooks específicos do
  nosso domínio (carimbo de `glossaryVersion`, `regulatoryPackVersion`,
  `judge_model_version`, `clientId`).
- **Custo de evals em CI**: 180 itens × 8 scorers × judge LLM ≈ **5.400 chamadas/
  noite**. Estimativa: dezenas de USD/noite a `gemini-2.5-pro`. Inviável diário —
  precisa estratégia smoke + full.
- **Drift de LLM-as-judge**: `gemini-2.5-pro` (judge atual via
  `getModel('reasoning')`) pode degradar sem aviso. Sem baseline humano, não
  detectamos.
- **Drift de glossário/regulatório**: mudança em definição (ex: "DSCR investment
  grade ≥ 1.3" → "≥ 1.4") **invalida evals históricos** — precisa re-rodar dataset.
- **LangSmith / proprietário**: SaaS terceirizado, fora do GCP, network egress, key
  separado.

## Decisão

**Construímos um eval harness próprio (`createScorer` factory leve em
`src/features/evals/`), com 5 scorers próprios + 3 built-in equivalentes,
dataset 30 smoke + 180 full + 30 gold (calibração humana), CI nightly smoke +
weekly full, e drift detection mensal de LLM-as-judge com threshold ±0.1 e σ>2.**

Especificações:

### Factory `createScorer`

```ts
export type ScoreResult = {
  score: number;          // 0-1
  reasoning?: string;
  metadata?: Record<string, unknown>;
};

export type Scorer = {
  name: string;
  type: 'function' | 'llm-judge';
  judgeModelVersion?: string;
  run: (input: ScorerInput) => Promise<ScoreResult>;
};

export const createScorer = (config: ScorerConfig): Scorer => { ... };
```

### Scorers próprios (5)

| Scorer | Tipo | Lógica |
|---|---|---|
| `sql_correctness` | function | dry-run BQ ok, `bytes_processed` razoável, partition filter presente, sem `SELECT *`/`CROSS JOIN`. |
| `layout_coherence` | function + judge | KPIs antes de detalhes, 3-5 blocos, cobertura `priority_kpis` ≥80%, visuais em `preferred_visuals`. |
| `persona_fit` | llm-judge | linguagem alinhada à persona, jargão correto, granularidade adequada. |
| `business_correctness` | llm-judge (regulatório injetado) | números coerentes, citações de norma corretas, sem alucinação. |
| `citation_grounding` | function | toda afirmação regulatória/numérica tem `source_doc` apontando para chunk RAG real. |

### Scorers built-in equivalentes (3)

`faithfulness`, `prompt-alignment`, `tool-call-accuracy` — implementação própria
espelhando `@mastra/core/evals` mas usando nossos primitives.

### Dataset

- **30 smoke**: subset representativo das 6 personas+clientes principais.
- **180 full**: 6 templates × 30 variações (matriz Sprint 3.D / plano §4).
- **30 gold**: itens com **calibração humana** (SME `credit-risk-analyst` atribui
  score esperado). Usado mensalmente para drift de judge.
- **Expansão futura**: 360 (12 personas × 30) na Fase 3+.

### CI

- **Nightly smoke** (30 itens × 8 scorers ≈ 240 chamadas) em PRs que tocam:
  `src/features/canvas-orchestrator/**`, `src/features/ai-agents/**`,
  `src/shared/config/agents/**`. GitHub Actions schedule + per-PR.
- **Weekly full** (180 itens × 8 scorers ≈ 1440 chamadas + judges) em segunda à
  noite. Custo ≈ dezenas USD/semana (aceitável).
- **Monthly drift gold** (30 itens com baseline humano) — primeira segunda do mês.

### Drift detection

- A cada run de `gold`:
  - Score do judge atual vs baseline humano para cada item.
  - **Threshold ±0.1 sobre média** ou **σ > 2 desvios-padrão** dispara alarme.
- Versão do judge (`judge_model_version`) carimbada em todo run de eval. Mudança
  de modelo (ex: `gemini-2.5-pro` → `gemini-3.0-pro`) força re-baseline.
- Mudança de glossário/regulatório (`glossaryVersion`, `regulatoryPackVersion`)
  marca **todos** os runs anteriores como `stale`. Re-execução do dataset gold
  obrigatória antes de novo deploy.

### Versionamento

Todo `EvalRun` registra:
```ts
{
  runId, timestamp, scorerName, judgeModelVersion?,
  glossaryVersion, regulatoryPackVersion,
  briefingId, clientId, personaId, score, reasoning, durationMs, costUsd
}
```

Persiste em BigQuery `liquid_meta.eval_runs` para painel `/admin/agent-quality`.

### Painel admin

`/admin/agent-quality` (Sprint 3.D): p50/p95 por scorer, persona, cliente; trend
30/90 dias; alertas de drift.

## Consequências

### Positivas
- **Sem dependência de `@mastra/core/evals`**: alinhado com ADR-0002 (Mastra-as-
  library, não full).
- **Customização total**: hooks de `glossaryVersion`/`regulatoryPackVersion`/
  `clientId`/`judgeModelVersion` integrados natively.
- **Drift detectado**: 30 gold itens mensais flagam degradação de judge antes de
  prod.
- **Custo controlado**: smoke nightly + full weekly cabem em orçamento.
- **Observabilidade própria**: `liquid_meta.eval_runs` integra com painel custom
  Next.js.

### Negativas / Trade-offs
- **Reinvenção parcial**: `faithfulness`/`prompt-alignment`/`tool-call-accuracy` da
  Mastra são reimplementadas. Risco de divergência metodológica. Mitigação: ler
  `adrs/mastra/evals/*.mdx` como spec; portar lógica ao máximo.
- **Curadoria SME**: 30 gold + 180 full curados por `credit-risk-analyst` consome
  semanas. Custo único.
- **CI custa**: weekly full ≈ dezenas USD/semana. Aceitável vs benefício.
- **Manutenção**: scorers evoluem com mudança de glossário/regulatório — exige
  ownership clara.

### Neutras
- LangSmith/Braintrust ficam fora — reavaliação em 12 meses se evals próprias
  pesarem demais.
- Mastra `Mastra.scorers` registry compatível: nossa interface `Scorer` é superset.
  Migração reversa para Mastra full é viável.

## Alternativas consideradas

### Alternativa A — Adotar `@mastra/core/evals`
**Pros**: factory pronta, scorers built-in.
**Cons**: parte do runtime full, viola ADR-0002; pressupõe `Agent` lifecycle;
hooks customizados (versioning) exigem fork.
**Por que rejeitada**: alinhamento com ADR-0002.

### Alternativa B — LangSmith
**Pros**: produto maduro, UI rica, dataset versioning out-of-the-box.
**Cons**: SaaS, fora do GCP, network egress, key separado, custo seat-based.
**Por que rejeitada**: alinhamento com stack GCP + LGPD (eval data inclui chunks
RAG sensíveis).

### Alternativa C — Braintrust / Promptfoo
**Pros**: alternativas viáveis.
**Cons**: SaaS terceirizados; mesma análise da B.
**Por que rejeitada**: idem.

### Alternativa D — Sem evals (status quo)
**Pros**: zero custo.
**Cons**: regressões silenciosas em prompts/agentes; alucinação regulatória passa
batido; sem ROI mensurável de `business-context-personas-evals` plano.
**Por que rejeitada**: custo regulatório de alucinação é o motivo central do
plano.

## Implementação

- **Plano macro**:
  `docs/superpowers/plans/2026-05-04-business-context-personas-evals.md` §6,
  §6.3 (drift), §6.4 (custo CI), §7 Fase 3.
- **Spec sprint**:
  `docs/superpowers/specs/2026-05-04-sprint3-D-evals-scorers-dataset.md`.
- **Arquivos a criar**:
  - `src/features/evals/create-scorer.ts` — factory.
  - `src/features/evals/scorers/{sql-correctness,layout-coherence,persona-fit,
    business-correctness,citation-grounding,faithfulness,prompt-alignment,
    tool-call-accuracy}.ts`.
  - `src/features/evals/dataset/{smoke,full,gold}.ts` — fixtures.
  - `src/features/evals/runner.ts` — orquestra runs, persiste `eval_runs`.
  - Schema BQ: `liquid_meta.eval_runs`.
  - Painel: `app/(dashboard)/admin/agent-quality/`.
- **CI**:
  - `.github/workflows/eval-smoke.yml` — nightly smoke + per-PR.
  - `.github/workflows/eval-full.yml` — weekly Monday.
  - `.github/workflows/eval-drift.yml` — first Monday of month.
- **Reuso**: `experimental_telemetry` (AI SDK), `recordSpan` (Sprint 1.B),
  `retrieve_business_context` (Sprint 2.D).
- **Variáveis de ambiente**:
  - `EVAL_JUDGE_MODEL=gemini-2.5-pro` (fixar em prod, configurável em dev).
  - `EVAL_DRIFT_THRESHOLD=0.1`
  - `EVAL_DRIFT_SIGMA=2`
- **Curadoria**:
  - 30 gold por SME `credit-risk-analyst` em Sprint 3.D Task inicial.
  - 180 full por SME + revisão `finance-ux-writer`.

## Referências

- `docs/superpowers/plans/2026-05-04-business-context-personas-evals.md` §6,
  §6.3, §6.4, §7.
- `docs/superpowers/specs/2026-05-04-sprint3-D-evals-scorers-dataset.md`.
- `adrs/mastra/evals/create-scorer.mdx` — referência metodológica.
- `adrs/mastra/evals/{tool-call-accuracy,trajectory-accuracy,faithfulness,
  prompt-alignment}.mdx`.
- ADR-0002 (Mastra-as-library) — esta ADR é consequência direta.
- ADR-0006 (multi-tenancy) — `clientId` carimbado em cada eval run.

## Nota de aceitação

Accepted após pilot do smoke nightly + 30 gold (Sprint 3.D Bulks D1-D3).
