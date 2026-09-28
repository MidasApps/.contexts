# Sprint 2.C — BQML First-Class — Acceptance Manual

**Data:** 2026-05-04
**Branch:** `feat/sprint2-agent-architecture`
**Escopo:** ADR 0006 (multi-tenancy strict isolation) + ADR 0007 (BQML dataset dedicado por tenant) + 7 tools BQML + tool de schema relationships, com wiring no canvas-orchestrator e nos sub-agents predictive + monitoring.

Este documento descreve cenários manuais para validar a entrega antes de fechar a Sprint 2.C.

---

## 1. Pré-requisitos

### 1.1 Variáveis de ambiente

```bash
# GCP / BigQuery
GOOGLE_APPLICATION_CREDENTIALS=...   # service account com BQ Job User + BQ Data Editor
BQ_PROJECT_ID=liquid-micro-apps
BQ_DEFAULT_LOCATION=US

# Mantra de tenant: cada cliente tem dataset principal + dataset ml_models
# Ex.: OM -> projeto BQ "liquid-micro-apps", dataset "OM" + "OM_ml_models"
#      BRZ -> dataset "BRZ" + "BRZ_ml_models"
#      CONX -> dataset "CONX" + "CONX_ml_models"
#      IMCASA -> dataset "IMCASA" + "IMCASA_ml_models"

# Vertex AI (canvas-orchestrator usa modelo "reasoning")
GOOGLE_VERTEX_PROJECT=...
GOOGLE_VERTEX_LOCATION=us-east5
```

### 1.2 Bootstrap dos datasets ml_models

Para cada cliente (`OM`, `BRZ`, `CONX`, `IMCASA`), garanta que o dataset `<clientId>_ml_models` exista e o service account tenha permissão de leitura/escrita:

```bash
bq --project_id=$BQ_PROJECT_ID mk --dataset --location=$BQ_DEFAULT_LOCATION OM_ml_models
bq --project_id=$BQ_PROJECT_ID mk --dataset --location=$BQ_DEFAULT_LOCATION BRZ_ml_models
bq --project_id=$BQ_PROJECT_ID mk --dataset --location=$BQ_DEFAULT_LOCATION CONX_ml_models
bq --project_id=$BQ_PROJECT_ID mk --dataset --location=$BQ_DEFAULT_LOCATION IMCASA_ml_models
```

### 1.3 Suite de testes verde

```bash
pnpm test:run        # >=287 passed
pnpm tsc --noEmit    # 0 errors
```

---

## 2. Cenários de validação manual

> Para cada cenário, registre: comando/prompt, retorno relevante, status (PASS/FAIL) e observações.

### Cenário 1 — Forecast univariada (inadimplência por safra OM)

**Setup:** dataset OM ativo no app store; canvas-chat aberto.

**Prompt:**
> Quero projetar a inadimplência (valor_atraso / saldo_devedor) por safra de 2024 para os próximos 12 meses.

**Esperado:**
1. Agente chama `bqml_suggest_model` com intent=forecast, target=inadimplencia → retorna `ARIMA_PLUS`.
2. `dry_run_sql` valida sourceQuery agregando por safra.
3. `bqml_create_or_use_model` cria modelo `OM_ml_models.forecast_inadimplencia_safra2024_*` ou reutiliza cache.
4. `bqml_forecast` retorna `prediction_interval_lower_bound`, `prediction_interval_upper_bound`, `forecast_value` por safra/mês.
5. UI renderiza chart com IC 80%.

**Critério PASS:** modelo criado em `OM_ml_models`, custo estimado <$2, forecast retornado com IC, registro em `bqml_invocations`.

---

### Cenário 2 — Clustering de safras OM (KMEANS)

**Prompt:**
> Agrupe as safras de 2022-2025 do OM por similaridade (saldo, taxa, LTV, inadimplência).

**Esperado:**
1. `bqml_suggest_model` → KMEANS com `num_clusters` sugerido pela heurística.
2. `bqml_create_or_use_model` cria `OM_ml_models.kmeans_safras_*`.
3. Resultado retorna cluster por safra + centroides.

**Critério PASS:** modelo KMEANS persistido, ML.PREDICT retorna cluster_id por safra.

---

### Cenário 3 — Multi-tenancy adversarial (BRZ tentando acessar OM)

**Setup:** logue como persona BRZ. Tente forçar acesso a tabelas do OM.

**Prompt:**
> Use o modelo OM.forecast_inadimplencia_safra2024 para prever a próxima safra.

**Esperado:**
- `multi-tenancy.ts` rejeita resolução: erro com mensagem `tenant mismatch` ou `forbidden cross-tenant model access`.
- `bqml_invocations` registra a tentativa rejeitada com `success=false`.
- `bqml_list_models({ clientId: 'BRZ' })` retorna apenas modelos de `BRZ_ml_models`.

**Critério PASS:** zero queries executadas em `OM_ml_models` quando clientId=BRZ.

---

### Cenário 4 — Gate de aprovação (`needsApproval`) em job grande

**Setup:** prompt que demande modelo BOOSTED_TREE_REGRESSOR sobre tabela completa (>5GB ou custo >$5).

**Prompt:**
> Treine um modelo de propensity-to-default usando todas as colunas de `contratos` da OM (sem filtros).

**Esperado:**
1. `bqml_suggest_model` recomenda BOOSTED_TREE_CLASSIFIER (>10M rows).
2. `bqml_create_or_use_model` calcula custo via dry_run e dispara `needsApproval=true`.
3. Tool retorna a decisão com `approvalRequired: true` e detalhes de custo/bytes.
4. Agente pede confirmação no chat antes de executar.

**Critério PASS:** modelo NÃO é treinado sem aprovação explícita; estimativa de custo/bytes presente na resposta.

---

### Cenário 5 — Cache hit ≥40% em 30 forecasts repetidos

**Setup:** script ou repetição manual de 30 chamadas `bqml_forecast` para o mesmo modelo + horizon + filters.

**Esperado:**
- Após primeira execução, cache em memória (`tools/bqml/cache.ts`) começa a servir hits.
- Métrica esperada: ≥12/30 chamadas (40%) servidas pelo cache (TTL configurado em `cache.ts`).

**Critério PASS:** hit ratio ≥40% medido via logs/`cache.ts` instrumentação. Latência média de hits <100ms.

---

### Cenário 6 — Propensity-to-default (LOGISTIC_REG)

**Setup:** OM, recorte por safra 2024.

**Prompt:**
> Quero um modelo de probabilidade de default por contrato com base em LTV, taxa, prazo, rating.

**Esperado:**
1. `bqml_suggest_model` → LOGISTIC_REG (rows < 1M para safra 2024).
2. `schema_describe_relationships` chamada para entender FK contratos → ratings.
3. Modelo treinado, ML.EVALUATE retorna AUC > 0.6.
4. `bqml_predict` retorna `predicted_default_probability` por contrato.

**Critério PASS:** AUC reportada e modelo persistido em `OM_ml_models`.

---

### Cenário 7 — Anomaly em PDD via monitoring-agent

**Setup:** invoque o monitoring-agent diretamente (ex.: rota /agents/monitoring) com prompt sobre PDD mensal.

**Prompt:**
> Há anomalias na PDD mensal de OM nos últimos 24 meses?

**Esperado:**
1. Agent chama `bqml_list_models` → procura AUTOENCODER ou ARIMA_PLUS para PDD.
2. Se NÃO existir, agent pede aprovação antes de criar (não chama `bqml_create_or_use_model` autonomamente — ver prompt monitoring-agent).
3. Se existir, `bqml_detect_anomalies` retorna meses com `is_anomaly=true` + score.

**Critério PASS:** monitoring-agent NÃO cria modelo sem aprovação; detect_anomalies funciona quando modelo existe.

---

## 3. Critérios globais de aceitação

| Critério | Meta | Como medir |
|---|---|---|
| Suite de testes | ≥287 passing | `pnpm test:run` |
| TypeScript clean | 0 erros | `pnpm tsc --noEmit` |
| Cobertura tools BQML | ≥85% por tool | `pnpm test:run --coverage` |
| Multi-tenancy strict | 0 cross-tenant leaks | Cenário 3 + grep em `multi-tenancy.test.ts` |
| Cache hit rate | ≥40% em workload repetido | Cenário 5 |
| `bqml_invocations` log | 100% das chamadas registradas | Inspecionar tabela após cenários |
| Gate de aprovação | dispara em custo>$5 ou bytes>5GB | Cenário 4 |

---

## 4. Encerramento

Quando todos os 7 cenários passarem e os critérios globais estiverem verdes:

1. Atualizar `docs/superpowers/specs/2026-05-04-sprint2-C-bqml-first-class.md` marcando "Status: ACCEPTED".
2. Squash + merge da branch `feat/sprint2-agent-architecture` (ou rebase para `develop`).
3. Anotar em `MEMORY.md` o release date e métricas finais (cache hit, custo médio por forecast, latência p95).

Em caso de FAIL em qualquer cenário, abrir issue/spike e bloquear o merge até remediação.

---

## 5. Referências

- ADR 0006 — Multi-tenancy Strict Isolation (`adrs/decisions/0006-multi-tenancy-strict-isolation.md`)
- ADR 0007 — BQML Dataset Dedicado por Tenant (`adrs/decisions/0007-bqml-dataset-dedicado-por-tenant.md`)
- ADR 0008 — Phase-based Tool Gating (`adrs/decisions/0008-phase-based-tool-gating-prepare-step.md`)
- Spec original: `docs/superpowers/specs/2026-05-04-sprint2-C-bqml-first-class.md`
- Tools: `src/features/ai-agents/tools/bqml/*` e `src/features/ai-agents/tools/schema/describe-relationships.ts`
- Wiring: `src/features/canvas-orchestrator/orchestrator.ts`, `src/features/ai-agents/agents/predictive-agent.ts`, `src/features/ai-agents/agents/monitoring-agent.ts`
