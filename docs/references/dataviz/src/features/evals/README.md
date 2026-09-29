# Eval harness — Sprint 3.D

Harness proprio sobre AI SDK v6 para avaliar agentes (ADR-0010). Inclui:

- 8 scorers (5 own + 3 built-in) em `scorers/`.
- Datasets `smoke-30`, `full-180`, `gold-30` em `datasets/`.
- Runner CLI com cache + persistencia em `liquid_meta.eval_runs`.
- Drift detector mensal contra baseline humano (`gold-30.json` →
  `liquid_meta.judge_drift`).

## Cost budget — processo de aprovacao

A cada execucao do runner, `run-evals.ts` chama `checkBudget()` com
`plannedCalls = fixtures × scorers` e custo medio historico (placeholder
`$0.01/call` ate query real sobre `eval_runs.cost_usd` ser wired).

Comportamento:

| condicao                                   | resultado |
| ------------------------------------------ | --------- |
| `estimated <= budget`                      | OK        |
| `budget < estimated <= 1.2 × budget`       | `alert` — log warn, segue execucao |
| `estimated > 1.2 × budget`                 | `blocked` — `run-evals` aborta com erro |

Default: `EVAL_DAILY_BUDGET_USD = 30`.

### Aprovacao manual (override de bloqueio)

1. Reavaliar se a execucao realmente precisa rodar agora (suite=full toda
   PR e desperdicio — pre-existing CI ja roda smoke por path filter).
2. Se ainda for necessaria, exporte `EVAL_DAILY_BUDGET_USD=<novo>` para o
   teto desejado e justifique no PR/runbook (anexar #4-eyes approval).
3. Para CI: ajustar o secret `EVAL_DAILY_BUDGET_USD` no GitHub Actions e
   abrir PR de auditoria documentando a mudanca.

### Variaveis relacionadas

- `EVAL_DAILY_BUDGET_USD` — orcamento diario USD (default 30).
- `EVAL_DRIFT_THRESHOLD` — |delta| absoluto que dispara alerta de drift
  (default 0.1).
- `EVAL_DRIFT_SIGMA` — placeholder para futuro z-score (default 2).
- `OUTPUT_PROCESSOR_CITATION_MODE` — `enforce` | `soft` | `off`
  (default `soft`).

## Comandos

```bash
pnpm tsx --tsconfig tsconfig.scripts.json src/features/evals/runner/run-evals.ts --suite=smoke --dry-run
pnpm tsx --tsconfig tsconfig.scripts.json src/features/evals/runner/run-evals.ts --suite=full
pnpm tsx --tsconfig tsconfig.scripts.json src/features/evals/drift/detect-drift.ts
```

## CI workflow

`.github/workflows/agent-evals.yml`:
- `smoke` — pull_request com path filter; falha se p50 < 0.7.
- `full`  — schedule semanal (segunda 02:00 UTC); notifica Slack.
- `drift` — schedule mensal (dia 1, 03:00 UTC); roda gold + detector.

## Dashboard

`/admin/agent-quality` (route group `(admin)`) consome
`/api/admin/eval-runs` e `/api/admin/judge-drift`. Heatmap scorer x
persona + banner de drift ativo.
