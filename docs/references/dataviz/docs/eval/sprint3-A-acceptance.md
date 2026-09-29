# Sprint 3.A — Acceptance smoke test

> Nota: este arquivo vive em `docs/eval/` (e não em `docs/superpowers/specs/`)
> porque a pasta de specs é tratada como protected user-changes nesta sprint.

## Pré-requisitos

- Sprint 2.A concluído (pgvector + `embeddings_docs` + scrubber).
- Postgres local rodando (`pnpm db:up`) com migration 003 aplicada.
- Variáveis de ambiente Vertex (GCP) configuradas — embeddings reais.

## Passos

1. **Seed do gold dataset**
   ```bash
   pnpm migrate
   pnpm tsx scripts/eval-semantic-recall.ts --mode=seed
   ```
   Esperado:
   - 50 linhas em `embeddings_sql` (uma por entry de `docs/eval/gold-sql-reuses.json`).
   - Coluna `sql_text` sem PII bruto — verificar regex adversarial:
     ```bash
     pnpm test:run src/shared/lib/memory/persist-sql.regression.test.ts
     ```
     Espera `31 passed` (1 sanity + 30 fixtures).

2. **Recall pass (gold hit rate)**
   ```bash
   pnpm tsx scripts/eval-semantic-recall.ts --mode=test
   ```
   Esperado: `hitRate >= 0.40` (script faz `process.exit(1)` abaixo do
   threshold). Logs estruturados `component=eval-recall` por intent.

3. **Cross-agent readOnly enforcement**
   - Rodar Canvas Builder com `descriptive_agent` como sub-agent.
   - Tentar (via debug/test) injetar chamada a `setWorkingMemory` no sub-agente.
   - Esperado: `ReadOnlyMemoryError` propagado pelo `readonly-guard` (Sprint
     3.A Task 8).

4. **TTL eviction**
   ```bash
   pnpm cron:eviction              # banco de dev
   pnpm cron:eviction --allow-prod # banco dataviz (produção) — apaga dados
   ```
   Com data injetada `>90d` em entries de teste.
   Esperado: linhas antigas deletadas; linhas novas mantidas.

5. **Smoke E2E (10 sessões repetidas)**
   - Roteiro: 10 briefings repetidos no Canvas para o mesmo cliente/persona.
   - Contar hits via filtro nos logs estruturados:
     ```bash
     # Cloud Logging filter
     resource.labels.service_name="liquid-dataviz"
     jsonPayload.component="recall"
     jsonPayload.hit=true
     ```
   - Esperado: cache hit ratio >= 40% após o primeiro briefing concluir
     persistência.

## Critérios de aprovação

- [ ] `hit_rate >= 0.40` no gold dataset (Passo 2).
- [ ] PII regression 30/30 verde (Passo 1).
- [ ] `ReadOnlyMemoryError` lançado em tentativa de escrita por sub-agente (Passo 3).
- [ ] TTL deleta entries `>90d` sem reuso (Passo 4).
- [ ] Block draft NÃO substitui geração — output do model difere do recall
      retornado (verificar manualmente em uma sessão de Canvas Builder).

## Observações

- O eval script usa `querySqlEmbeddings` direto (e não a tool com binding
  server-bound) porque o smoke roda fora do contexto de request HTTP.
- A comparação de hit usa `top.sqlText === scrubPii(seed_sql)` — isso garante
  determinismo mesmo se o seed contiver PII (que é redacted antes do persist).
