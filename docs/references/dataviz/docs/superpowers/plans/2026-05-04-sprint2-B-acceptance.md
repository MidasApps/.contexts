# Sprint 2.B — Acceptance manual (workflow state-machine)

## Pré-requisitos
- Sprint 1.A/B/C/D + Sprint 2.A aplicados.
- `.env.local` com vars de Vertex + Postgres.
- Feature-flag `useWorkflowOrchestrator=true` no app-store.

## Smoke checklist
- [ ] `pnpm test:run` verde (≥230 tests)
- [ ] `pnpm tsc --noEmit` clean
- [ ] `pnpm build` (Next.js) passa
- [ ] `pnpm tsx scripts/smoke-workflow-orchestrator.ts` retorna `ok: true` com `blockCount > 0`
- [ ] Logs do servidor mostram spans `workflow:build-dashboard`, `step:plan`, `step:gather-context`, `step:design-layout`, `step:fill-blocks`, `step:cross-validate`, `step:render-commit`
- [ ] `pnpm measure:workflow /tmp/canvas.ndjson` mostra p50/p95 por step

## Tabela baseline p50/p95 (preencher após coleta)

| span | samples | p50 (ms) | p95 (ms) | p99 (ms) |
|------|---------|----------|----------|----------|
| `workflow:build-dashboard` | | | | |
| `step:plan` | | | | |
| `step:gather-context` | | | | |
| `step:design-layout` | | | | |
| `step:fill-blocks` | | | | |
| `step:cross-validate` | | | | |
| `step:render-commit` | | | | |

## Failure cases
- [ ] `clientId` omitido → `MissingTenantError` antes de step 1
- [ ] BQML probe falha → fallback SQL ativa branch
- [ ] SQL inválido em 1 slot → `dountil` repara em 2ª tentativa
- [ ] SQL inválido em 1 slot após 3 tentativas → erro tipado, outros slots não afetados

## Referências
- ADR-0003: [Mini state-machine](../../../adrs/decisions/0003-mini-state-machine-vs-mastra-core.md)
- Plano-fonte: `docs/superpowers/plans/2026-05-04-mastra-workflows-network.md` Fase 2
- Spec sprint: `docs/superpowers/specs/2026-05-04-sprint2-B-workflow-statemachine.md`
