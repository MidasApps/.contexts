# Sprint 1.C — Acceptance manual (BQ dry-run, repair, schema v2, sql_generations)

## Pré-requisitos

```bash
# 1. Cloud SQL local (vinda da Sprint 1.A)
./scripts/db-up.sh
pnpm migrate

# 2. Provisionar dataset de observability
pnpm bq:bootstrap-meta

# 3. Habilitar logger no .env.local
echo "SQL_GENERATIONS_LOGGING=true" >> .env.local
echo "BIGQUERY_PROJECT_ID=<seu-projeto>" >> .env.local
echo "BIGQUERY_LOCATION=US" >> .env.local

# 4. Subir app capturando logs
pnpm dev 2>&1 | tee /tmp/sprint1c.ndjson
```

Abrir <http://localhost:3005>, autenticar, ir para `/dashboard/explore`.

---

## Cenário 1 — Fluxo feliz (schema → dry_run → execute)

1. Pedir no chat: **"Crie um KPI com a soma de `valor_contrato` no último mês para OM."**
2. Verificar nos logs (`/tmp/sprint1c.ndjson`) tool calls **na ordem**:
   - `plan_analysis`
   - `get_table_schema` (com `cacheHit: false` no span — primeira chamada)
   - `dry_run_sql` com `valid: true`, `bytesProcessed: <N>`
   - `query_data` com `success: true`
   - `add_kpi_block` ou `fill_layout`/`fill_block`
3. Verificar BQ:
   ```sql
   SELECT id, ts, success, dry_run_valid, repair_attempts, rows, latency_ms
   FROM `${BIGQUERY_PROJECT_ID}.liquid_meta.sql_generations`
   ORDER BY ts DESC LIMIT 5;
   ```
   Esperar entry com `success=true, dry_run_valid=true, repair_attempts=0`.

✅ **Aprovação**: ordem das tool calls + entry no `sql_generations`.

---

## Cenário 2 — Repair callback em ação

1. Pedir: **"Liste contratos com `valor_contrato_xpto > 1000`."** (coluna inexistente proposital).
2. Esperar nos logs:
   - `dry_run_sql` retorna `{valid: false, errorClass: 'reference'}`.
   - Callback `experimental_repairToolCall` aciona; `generateObject` retorna SQL com nome correto (ex.: `valor_contrato`).
   - `dry_run_sql` segunda chamada → `valid: true`.
   - `query_data` executa.
3. Verificar BQ:
   ```sql
   SELECT sql_draft, final_sql, repair_attempts, dry_run_valid, success
   FROM `${BIGQUERY_PROJECT_ID}.liquid_meta.sql_generations`
   WHERE repair_attempts > 0
   ORDER BY ts DESC LIMIT 1;
   ```
   Esperar `repair_attempts=1`, `sql_draft` ≠ `final_sql`.
4. **Cap test**: pedir 3 perguntas com mesma coluna inválida em sequência. Após 2 retries (cap session budget), o modelo deve cair em `ask_user` ou retornar erro legível em vez de retry infinito.

✅ **Aprovação**: 1 retry com sucesso; 3º retry no mesmo session bloqueado.

---

## Cenário 3 — Schema v2 cache hit

1. Em sessão fresca, pedir 5 KPIs sequenciais sobre `contratos` (mesmo dataset).
2. Verificar spans no `/tmp/sprint1c.ndjson`:
   - 1ª chamada: `schema_v2.lookup` com `cacheHit: false`.
   - Chamadas 2-5: `schema_v2.lookup` com `cacheHit: true`.
   - Após 10 lookups: 1 span `schema_v2.cache_stats` com `hitRate >= 0.5`.

✅ **Aprovação**: 4 hits e 1 miss em 5 lookups.

---

## Cenário 4 — `needsApproval` para queries grandes

1. Reduzir threshold temporariamente:
   ```bash
   echo "BQ_APPROVAL_BYTES_THRESHOLD=1024" >> .env.local
   pnpm dev
   ```
2. Pedir uma query agregada que processe >1KB (qualquer SELECT em tabela populada).
3. UI deve apresentar **prompt de aprovação** antes de execute (AI SDK v6 `tool-approval-request`).
4. Aprovar; query executa; entry em `sql_generations` aparece.
5. Negar; query NÃO executa; verificar que não há row nova em `sql_generations`.
6. Reverter threshold para `5368709120` (5GB).

✅ **Aprovação**: prompt aparece, ambos caminhos (approve/deny) funcionam.

---

## Cenário 5 — `prepareStep` gating

1. Pedir: **"Ajuste o título do bloco X."** (intent de edição, não SQL).
2. Verificar logs: NÃO deve aparecer `dry_run_sql` nem `query_data` no histórico — apenas `update_*_block`. `prepareStep` em fase de descoberta libera tools de edição.
3. Pedir SQL nova depois: deve fazer `get_table_schema` antes de `query_data`.

✅ **Aprovação**: edição não bloqueia em `dry_run_sql`; SQL nova respeita ordem.

---

## Critérios globais de aprovação

- [ ] `pnpm test:run` verde (≥78 tests)
- [ ] `pnpm tsc --noEmit` clean
- [ ] `pnpm build` (Next.js) passa
- [ ] Cenários 1-5 manualmente verificados
- [ ] `liquid_meta.sql_generations` populado com pelo menos 5 rows após smoke
- [ ] Spans `schema_v2.lookup` e `schema_v2.cache_stats` aparecem nos logs

## Encerrar

```bash
./scripts/db-down.sh
```

## Referências

- ADR-0006: [Multi-tenancy strict isolation](../../adrs/decisions/0006-multi-tenancy-strict-isolation.md)
- ADR-0009: [SQL reuse hierarchy](../../adrs/decisions/0009-sql-reuse-hierarchy-catalog-recall-fresh.md)
- Plano-fonte: `2026-05-04-sprint1-C-bq-dry-run-repair.md` (mesma pasta)
- Tabela observability: `docs/observability/sql-generations-setup.md`
