# Sprint 1.B — Acceptance smoke + baseline collection

Pré-requisitos: Docker (Sprint 1.A `db-up.sh`), `.env.local` com `DATABASE_URL`, BigQuery deps configuradas.

## Smoke steps

1. **Subir o app** (preferir `pnpm dev` capturando logs em arquivo):
   ```bash
   ./scripts/db-up.sh
   pnpm migrate
   pnpm dev 2>&1 | tee /tmp/canvas.ndjson
   ```

2. **Abrir** <http://localhost:3005>, autenticar, ir para `/explore`.

3. **Pedir um dashboard de 6 KPIs** no chat:
   > "Monte um dashboard com 6 KPIs de inadimplência por safra para OM."

4. **Confirmar nos logs** (`/tmp/canvas.ndjson`):
   - 1 chamada `fill_layout_started slotCount=6` (não 6× `fill_block`).
   - 6 spans `fill_layout_slot_*` com `attributes.slotId` correspondentes.
   - 1 span `fill_layout_total` com `attributes.slotCount=6, concurrency=3`.
   - 1 span `fill_layout_complete` com `successCount + errorCount + abortedCount = 6`.

5. **Repetir 10× com perguntas variadas** (4/6/8/10 KPIs) para coletar amostras.

6. **Agregar percentis**:
   ```bash
   pnpm tsx scripts/measure-fill-baseline.ts /tmp/canvas.ndjson
   ```
   Saída esperada: tabela markdown com `slotCount | samples | p50 | p95 | p99`.

## Baseline coletada (preencher após execução)

| slotCount | samples | p50 (ms) | p95 (ms) | p99 (ms) |
|-----------|---------|----------|----------|----------|
| 4         |         |          |          |          |
| 6         |         |          |          |          |
| 8         |         |          |          |          |
| 10        |         |          |          |          |

**Observado em** _(data, ambiente)_: ___________________

## Comparação

Esta sprint **estabelece BASELINE** — não há target fechado de redução percentual. Sprint 2 (workflow tipado + branches BQML) compara contra esta linha. Critério mínimo desta sprint: build de 6 blocos termina sem timeout (≤ 60s wall-clock) e ≥4/6 slots retornam `success` em condição normal.

## Failure cases verified

- [ ] **1 slot SQL inválido proposital** (forçar via prompt): outros 5 slots entregam, slot inválido retorna `status=error`, build não trava.
- [ ] **Fechar chat mid-build** (`AbortController` propaga): slots in-flight retornam `status=aborted`, contador `abortedCount > 0`.
- [ ] **Concurrency override**: `FILL_LAYOUT_CONCURRENCY=2 pnpm dev` → spans mostram `attributes.concurrency=2`.
- [ ] **fill_block individual** (retry pontual): pedir "tente novamente o slot X" → 1 span `fill_layout_slot_X` (não `fill_layout_total`).

## Critérios de aprovação

- [ ] Modelo invoca `fill_layout` UMA vez (não N× `fill_block`) em build novo
- [ ] Tabela de percentis preenchida com ≥10 amostras por `slotCount`
- [ ] `pnpm test:run` verde (44+ tests)
- [ ] `pnpm tsc --noEmit` verde
- [ ] `pnpm build` (Next.js) passa
- [ ] Failure cases acima (4 itens) testados manualmente

## Encerrar

```bash
./scripts/db-down.sh
```

## Referências

- Plano-fonte: `2026-05-04-sprint1-B-parallel-fill-blocks.md` (mesma pasta)
- ADR-0003: [Mini state-machine vs `@mastra/core` workflows](../../adrs/decisions/0003-mini-state-machine-vs-mastra-core.md)
- Telemetria: `src/shared/lib/telemetry/record-span.ts` (Task 7)
- Script de medição: `scripts/measure-fill-baseline.ts` (Task 10)
