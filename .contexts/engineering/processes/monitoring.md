# Monitoring

Processo operacional de monitoramento de produção: ferramentas, dashboards, SLOs, alertas, on-call e resposta a incidentes.

Este documento descreve **como operamos** a observabilidade em produção. Para regras universais de instrumentação (logs estruturados, correlation IDs, níveis), veja `@rules/observability`. Para mitigação de incidentes, veja `@processes/rollback`. Para gates de entrega, veja `@processes/deploy` e `@processes/release`.

---

## Filosofia

- **Monitoring responde uma pergunta**: o sistema está saudável agora? Se não, qual é o impacto e o que fazer?
- **Alerta acionável ou não é alerta**. Toda página tem runbook, severidade clara e ação imediata. Alerta sem dono é alerta morto.
- **Sintomas > causas**. Alertamos quando o usuário é impactado (latência alta, erro 5xx, fluxo quebrado), não quando CPU passa de 80% sem efeito visível.
- **Sem alert fatigue**. Se um alerta dispara e ninguém investiga em três ocorrências consecutivas, ele é rebaixado, ajustado ou removido.
- **Custo de observar não pode dominar o custo de operar**. Sampling, retention e cardinality são decisões econômicas explícitas.

---

## Stack canônico

| Camada | Ferramenta padrão | Função |
|---|---|---|
| Métricas de infra | Cloud Monitoring (GCP) | Métricas nativas de Firebase Functions, Cloud Run, Cloud SQL |
| Logs centralizados | Cloud Logging | Structured logs com correlation IDs (veja `@rules/observability`) |
| Distributed tracing | OpenTelemetry → Cloud Trace (ou Sentry/Honeycomb/Datadog) | Rastreamento ponta a ponta |
| Error tracking | Sentry | Captura e agrupamento de exceptions com source maps |
| Web/edge analytics | Vercel Analytics | Web vitals reais, edge metrics |
| LLM observability | Langfuse (default) ou Braintrust | Traces de IA, evals, cost attribution — veja `@stacks/ai/harness-engineering` |
| Alerting + on-call | PagerDuty (ou Better Stack) | Rotação, escalation, paging |
| Product analytics | PostHog | Funis, retention, business metrics |
| Synthetic probes | Better Uptime | Probe externo de uptime e fluxos críticos |
| Status page | statuspage.io (ou Better Stack) | Comunicação pública de incidentes |

Toda nova ferramenta entra via ADR (`@decisions`). Não adicionamos overlap sem retirar o anterior.

---

## Pilares de observabilidade

Os quatro pilares são instrumentados conforme `@rules/observability`. Aqui definimos onde cada pilar **mora** em produção:

- **Logs** → Cloud Logging. Structured JSON, correlation ID obrigatório, sem PII (`@rules/security`, `@contracts/secrets`).
- **Metrics** → Cloud Monitoring + custom metrics via OpenTelemetry.
- **Traces** → OpenTelemetry SDK → exportador para Cloud Trace ou backend escolhido.
- **Events** → Domain events em BigQuery, modelados conforme `@contracts/events`. Usados para business dashboards e auditoria.

---

## SLOs canônicos

Toda feature crítica declara SLO antes do go-live. Valores padrão (sobrescrever apenas com justificativa em ADR):

| Categoria | SLO |
|---|---|
| Availability (serviços críticos) | 99.9% mensal (três noves) |
| Latency HTTP — p50 | < 200 ms |
| Latency HTTP — p95 | < 800 ms |
| Latency HTTP — p99 | < 2 s |
| LLM streaming — TTFT | < 1 s |
| LLM completion total | < 30 s |
| Error rate (5xx) | < 1% |
| Web vitals — LCP (p75) | < 2.5 s (veja `@rules/performance`) |
| Web vitals — INP (p75) | < 200 ms |
| Web vitals — CLS (p75) | < 0.1 |

**SLI sources**: métricas Cloud Monitoring nativas + custom metrics OTel emitidas pela aplicação. SLOs são revisados trimestralmente.

### Error budget

Para cada SLO, o error budget é `1 - SLO`. Consumo é rastreado em dashboard dedicado.

- **Budget saudável (< 50% consumido no mês)**: operação normal, releases prosseguem conforme `@processes/release`.
- **Budget em risco (50–80% consumido)**: revisão de risco em cada release; foco em estabilidade.
- **Budget esgotado (> 100%)**: **freeze de features**. Apenas correções de estabilidade e bugfixes entram em produção até budget retornar ao verde. Decisão de freeze é registrada em ADR ou em incident report.

---

## Dashboards

Cada dashboard tem **dono nomeado** (engenheiro ou squad). Dashboard sem dono é candidato a remoção na revisão trimestral.

### Overview (um por bounded context)

Padrão **RED** (Rate, Errors, Duration) + saturação:

- Requests por segundo, por endpoint
- Error rate (4xx separado de 5xx)
- Latência p50/p95/p99
- Saturação (CPU, memória, conexões)
- Top 10 errors (link para Sentry)
- Top 10 slow queries
- Top endpoints por volume

### Infra

- Connections em Postgres (`@stacks/database/postgres`)
- Locks e replication lag
- Cache hit ratio
- Function invocations e cold starts (`@stacks/backend/firebase-functions`)
- Firestore reads/writes e quota usage (`@stacks/database/firebase-firestore`)

### Business

- Signups, ativações, orders, retention
- Derivado de domain events (`@contracts/events`)

### AI ops (`@stacks/ai/harness-engineering`)

- Token usage por feature e por usuário
- Cost attribution (input/output/cache hits separados)
- Latência por modelo
- Distribuição de `finish_reason`
- Tool call success rate
- Eval scores e regression alerts
- Cache hit rate (Anthropic explicit, OpenAI automatic)
- Refusal rate e hallucination flags

### Web vitals

- LCP, INP, CLS p75 por rota
- Comparação semana a semana

---

## Alertas

### Princípios

- **Acionável**: cada alerta linka um runbook ou ação clara (rollback, flag flip, scale).
- **Sintoma > causa**: alertamos no impacto ao usuário. CPU 80% sem impacto **não** alerta.
- **Thresholds com janela**: nunca alertar em pico instantâneo; sempre `por N min`.

### Severidades

| Severidade | Resposta | Canal |
|---|---|---|
| **P1 (page)** | Usuários impactados agora. Acordar on-call. | PagerDuty page + `#incidents` |
| **P2 (urgent)** | Degradação não crítica. Atender em horário comercial. | PagerDuty notify + `#alerts` |
| **P3 (info)** | Tendência negativa, capacity planning. | `#alerts-info` |

### Thresholds canônicos

| Sinal | Threshold | Severidade |
|---|---|---|
| Error rate (5xx) | > 2% por 5 min | P1 |
| p95 latency | > 2× baseline por 10 min | P2 |
| SLO burn rate fast (1h consome 2% budget mensal) | — | P1 |
| SLO burn rate slow (6h consome 5% budget mensal) | — | P2 |
| Cost spike | > 3× baseline horário | P2 |
| Token usage | acima do budget diário do feature | P2 |
| Postgres connections | > 80% do pool | P2 |
| Firestore quota | > 80% do limite | P2 |
| Synthetic probe | falha em 2 regiões consecutivas | P1 |
| Audit log gap | nenhum evento por > 5 min em fluxo ativo | P2 |

---

## On-call rotation

- **Rotação semanal** entre engenheiros do time. Hand-off às terças, 10h.
- **Primary + Secondary**: secondary é acionado se primary não acknowledge em 5 min.
- **Hand-off doc**: estado pendente, incidents em aberto, alertas suprimidos, mudanças recentes em produção (`@processes/deploy`).
- **Compensação**: incident fora de horário em madrugada gera folga compensatória no dia seguinte.
- **Escalation chain**: Primary → Secondary → Tech Lead → CTO.

---

## Runbooks

- Mantidos próximos do código que documentam (per-feature `RUNBOOK.md` na pasta da feature) e em `@processes/rollback` para mitigações canônicas.
- **Todo alerta P1 linka um runbook.** Alerta P1 sem runbook é bug do alerta — corrigir antes de mergear.
- Atualizados após cada incident como action item do postmortem.

---

## Incident response

Fluxo padrão:

1. **Detect** — alerta dispara, ou usuário reporta via `#incidents`.
2. **Triage** (5 min): determinar severidade, escopo, número de usuários impactados, sistemas afetados.
3. **Mitigate** — aplicar a mitigação mais rápida: rollback (`@processes/rollback`), flag flip, scale up, circuit breaker. **Mitigar antes de entender root cause.**
4. **Communicate**:
   - Status page atualizada em ≤ 10 min para incidents user-facing.
   - Updates a cada 30 min em `#incidents` enquanto ativo.
5. **Resolve** — root cause corrigido, sistema verificado, status page marcada `resolved`.
6. **Postmortem** — blameless, conforme `@rules/governance`. Timeline, root cause, contributing factors, action items com dono e prazo. **Sem culpa pessoal.**

### Status page

- Pública para clientes externos quando contratualmente exigido.
- Histórico de incidents preservado.
- Atualização durante incident é responsabilidade do **incident commander**, não do engenheiro mitigando.

---

## Logging em produção

Regras detalhadas em `@rules/observability`. Operacionalmente:

- **Formato**: structured JSON, sempre.
- **Levels**: `info` é mínimo em produção. `debug` apenas via flag opt-in temporária.
- **Sampling**: logs verbosos amostrados por correlation ID (mesma request inteira ou nada).
- **Retention**: padrão 30 dias para application logs. Audit logs separados, retention conforme compliance LGPD/GDPR (`@rules/governance`).
- **Proibido**: PII, secrets, tokens, payloads sensíveis em logs (`@rules/security`, `@contracts/secrets`). Redaction é responsabilidade do emissor.

---

## AI-specific monitoring

Detalhe em `@stacks/ai/harness-engineering`. Métricas obrigatórias em produção:

- Token usage por feature, modelo e usuário
- Cost attribution por feature (input/output/cache separados)
- Latência por modelo e por provider
- Distribuição de `finish_reason` (stop, length, tool_use, refusal)
- Tool call success rate e erros de schema
- Eval score por release; regressão de score dispara P2
- Cache hit rate
- Refusal rate e flags de hallucination (quando instrumentadas)

---

## Database monitoring

### Postgres (`@stacks/database/postgres`)

- Slow queries via `pg_stat_statements`
- Connection pool saturation
- Replication lag em réplicas de leitura
- Index hit ratio
- Vacuum/autovacuum status

### Firestore (`@stacks/database/firebase-firestore`)

- Composite index miss warnings
- Hot document contention
- Read/write quota approaching

### pgvector (`@stacks/database/pgvector`)

- ANN recall sampling periódico
- Index rebuild duration
- Query latency por dimensão

---

## Cost monitoring

Detalhe de governança em `@rules/governance`. Operacionalmente:

- **Budget alerts** em cada projeto GCP, com thresholds em 50/80/100% do orçamento mensal.
- **Anomaly detection** em billing GCP ativada.
- **Per-feature cost attribution** obrigatória para features de IA (label de telemetria amarra spend a feature).
- **Egress monitoring** em buckets e regiões com alto risco de transferência.

---

## Synthetic monitoring

Probes externos detectam downtime que métricas internas não pegam (DNS, CDN, regional outage):

- Probe de health endpoint a cada 1 min, de pelo menos 3 regiões.
- Probe de fluxo crítico (login, checkout, prompt-respond) a cada 5 min.
- Falha em 2 regiões consecutivas dispara P1.

---

## Real User Monitoring (RUM)

- Web vitals reais coletados via Vercel Analytics + Sentry Performance.
- Web vitals reportados em dashboard semanal por rota.
- Regressão > 20% em LCP/INP/CLS p75 dispara P2 e investigação em `@rules/performance`.

---

## Sampling estratégico

Conforme `@rules/observability`. Defaults operacionais:

| Categoria | Sampling em prod (alta volume) | Sampling em staging |
|---|---|---|
| Traces | 1–10% | 100% |
| Logs verbose (`debug`/`info` em hot path) | sample por request ID | 100% |
| Errors | 100% sempre | 100% |
| Domain events | 100% sempre | 100% |

---

## Audit logs

- Separados de application logs (sink dedicado em Cloud Logging).
- Retention longa conforme compliance (`@rules/governance`).
- Imutáveis: nenhum processo apaga audit logs fora do schedule de retention.
- Cobrem: autenticação, autorização, mudanças em dados sensíveis, acessos administrativos.

---

## Capacity planning

Revisão **mensal**, baseada em tendência de 90 dias:

- Ajuste de `minInstances` em Cloud Functions / Cloud Run (`@stacks/backend/firebase-functions`)
- Tamanho de connection pool em Postgres
- Quotas em Firestore e provider de IA
- Limites de billing
- Provisioned concurrency em endpoints com cold start crítico

Resultado da revisão é registrado e linkado em `@processes/environments`.

---

## Anti-patterns

- **Alert fatigue**: tudo é P1, ninguém responde.
- **Alerta zumbi**: dispara recorrentemente, ninguém investiga, ninguém remove.
- **Dashboard órfão**: sem dono, sem revisão, desatualizado.
- **SLO sem error budget tracking**: número decorativo.
- **On-call único**: mesma pessoa sempre acordada — burnout garantido.
- **Postmortem com culpa pessoal**: viola `@rules/governance` e destrói cultura de transparência.
- **PII em logs**: vazamento de compliance — viola `@rules/security`.
- **Sem correlation ID**: distributed tracing impossível, debugging cego.
- **Trace sampling 100% em alto volume**: custo explode e ruído domina sinal.
- **Métricas high-cardinality**: label com `user_id` ou `request_id` explode séries e custo.
- **Alerta crítico sem runbook**: on-call paralisado às 3h da manhã.
- **Status page só após incident público**: perda de confiança do cliente.
- **Custo de observabilidade > custo da app**: over-instrumentation.
- **Ferramentas overlapping**: três provedores de tracing, nenhum canônico.
- **Sem synthetic monitoring**: downtime invisível até cliente reportar.
- **Sem AI-specific metrics**: custo de tokens silencioso até a fatura chegar.
- **Alerta em causa, não sintoma**: CPU 90% sem usuário impactado paga noites de sono sem retorno.

---

## Referências cruzadas

- `@rules/observability` — regras universais de instrumentação
- `@rules/security` — proibição de PII/secrets em logs
- `@rules/governance` — compliance, retention, postmortem blameless
- `@rules/performance` — web vitals e budgets de performance
- `@processes/deploy` — gates de entrega e mudanças em produção
- `@processes/environments` — staging/prod, capacity planning
- `@processes/rollback` — runbooks canônicos de mitigação
- `@processes/release` — error budget como gate de release
- `@stacks/ai/harness-engineering` — LLM observability detalhada
- `@stacks/backend/firebase-functions` — cold starts, invocations
- `@stacks/database/postgres` — slow queries, conexões
- `@stacks/database/firebase-firestore` — quotas, índices
- `@stacks/database/pgvector` — recall, latency de busca vetorial
- `@contracts/events` — domain events em BigQuery
- `@contracts/secrets` — convenções de naming e redaction
