# Sprint 3.B — Acceptance: supervisor improvements (A/B)

Este documento descreve como executar o A/B harness para validar o pacote
Sprint 3.B (gating por fase + compactação V2 + cache stub) frente ao
baseline atual.

## Artefatos

- `scripts/datasets/supervisor-eval.jsonl` — 30 conversas sintéticas
  curadas cobrindo as 4 fases analíticas (`discovery`, `diagnosis`,
  `prescription`, `monitoring`) distribuídas entre BRZ, OM, CONX e
  IMCASA.
- `scripts/ab-test-supervisor.ts` — harness que executa cada conversa
  duas vezes (`baseline` com flag OFF, `improved` com flag ON),
  paraleliza com `pLimit(3)`, e escreve um CSV com latência, tokens,
  fases observadas e dois sinais de qualidade heurísticos.

## Pré-requisitos

1. `pnpm dev` rodando em `http://localhost:3005`.
2. Acesso a um cliente válido (BRZ/OM/CONX/IMCASA) configurado no
   ambiente.
3. Auth bypass habilitado (
   `NEXT_PUBLIC_FIREBASE_EMULATOR=true`) ou ajuste o harness para
   anexar um Firebase ID token válido.

## Execução

```bash
# Diretamente com tsx (não há script em package.json — protegido)
pnpm exec tsx scripts/ab-test-supervisor.ts \
  --dataset scripts/datasets/supervisor-eval.jsonl \
  --out scripts/datasets/ab-results.csv \
  --concurrency 3 \
  --base-url http://localhost:3005
```

Saída: `scripts/datasets/ab-results.csv` com as colunas:

| coluna | descrição |
|---|---|
| `id` | Id da conversa (ex.: `sup-001`) |
| `variant` | `baseline` ou `improved` |
| `client` | BRZ / OM / CONX / IMCASA |
| `phase` | Fase esperada (ground truth do dataset) |
| `durationMs` | Latência total da requisição |
| `tokensIn` / `tokensOut` | Tokens consumidos (best-effort, lidos do stream) |
| `phasesObserved` | Fases inferidas pelo orchestrator durante o run |
| `hasHypothesis` | Heurística: regex `/hipótese\|hypothesis/i` |
| `citesSource` | Heurística: regex `/\[fonte\|source:/i` |
| `status` | `ok` ou `error` |
| `error` | Mensagem em caso de falha |

## O que validar (baseline ↔ improved)

1. **Latência (p50/p95).** `improved` deve ficar dentro de ±15% do
   baseline (gating não pode degradar significativamente).
2. **Tokens.** Esperado redução em `tokensIn` no `improved` graças à
   compactação V2 e ao cache stub (no mínimo paridade).
3. **Cobertura de fases.** `phasesObserved` deve refletir a fase
   esperada (`phase`) na maioria das conversas (>70%).
4. **Qualidade heurística.** `hasHypothesis` em conversas
   `phase=diagnosis` e `citesSource` em `prescription`/`monitoring`
   devem subir ou ficar estáveis no `improved`.
5. **Estabilidade.** `error` deve ser zero em ambos os variants;
   gating fallback (`fallbackToAuto`) não deve aparecer em mais de 10%
   dos steps.

## Manual smoke (Task 14)

Após validar o CSV, rodar manualmente o smoke E2E descrito na spec
`docs/superpowers/specs/2026-05-04-sprint3-B-supervisor-analytic-improvements.md`
(seção "Smoke") com a flag ligada via UI em
`/admin/orchestrator-analytics`.

## Limitações conhecidas

- O endpoint `/api/admin/orchestrator-metrics` ainda retorna shape
  vazio — agregação de spans virá em sprint posterior. A análise do
  CSV cobre o gap por enquanto.
- A inferência de tokens via regex é best-effort; números absolutos
  podem divergir do billing Vertex. Use sempre como comparativo
  baseline ↔ improved.
- O dataset é sintético; não substitui evals com `credit-risk-analyst`
  (Sprint 3.D).
