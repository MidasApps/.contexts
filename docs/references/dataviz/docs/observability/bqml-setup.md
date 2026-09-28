# BQML setup (Sprint 2.C)

ADRs governantes:
- [ADR-0006 — Multi-tenancy strict isolation](../../adrs/decisions/0006-multi-tenancy-strict-isolation.md)
- [ADR-0007 — BQML dataset dedicado por tenant](../../adrs/decisions/0007-bqml-dataset-dedicado-por-tenant.md)

## Provisionamento

```bash
BIGQUERY_PROJECT_ID=<projeto> BIGQUERY_LOCATION=US pnpm bq:bootstrap-bqml
```

Cria 4 datasets `liquid_bqml_{om,brz,conx,imcasa}` + tabelas `liquid_meta.bqml_model_registry` e `liquid_meta.bqml_invocations`. Idempotente.

## IAM

Service Account `liquid-bqml-sa` com:
- `bigquery.dataEditor` + `bigquery.jobUser` + `bigquery.models.create` nos 4 `liquid_bqml_<client>`
- `bigquery.metadataViewer` nos datasets de leitura

O pré-check de startup que vivia na rota `/api/ai/canvas` saiu com o canvas (ADR-0020). As tools BQML hoje validam por chamada: `sourceQuery`/`inputQuery` por `checkTenantQuery`, e o dataset do modelo derivado do tenant.

## Custos

- ARIMA_PLUS: $250/TB
- LOGISTIC_REG / KMEANS / BOOSTED_TREE: $6.25/TB

Aprovação: bytes estimados acima de `approvalBytesThreshold()` (default: metade
do teto `BQ_MAX_BYTES_BILLED`, 2,5 GiB; `BQML_APPROVAL_BYTES_THRESHOLD` ajusta, mas
só vale abaixo do teto) **ou** custo dos bytes do dry-run > $5 USD (ADR-0007;
`BQML_APPROVAL_COST_USD`). Com o teto padrão o treino custa no máximo ~$1,3, então
o gate em USD só age quando `BQ_MAX_BYTES_BILLED` é elevado. Estimativa acima do teto
é recusada sem job (`ACIMA_DO_TETO`). Ver `.contexts/engineering/rules/cost.md`.

## Revogação de tenant

Revoga `bigquery.dataEditor` na SA para o dataset alvo. Mantém histórico no registry. Tools BQML rejeitam por `assertClientMatchesDataset`.
