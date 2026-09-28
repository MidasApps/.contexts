---
name: monitoring
description: Use ao configurar/investigar monitoring, alertas, dashboards. Keywords: monitoring, alerts, sli, slo.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Monitoring

Conjunto coordenado de SLIs, SLOs, alertas e dashboards que indicam se o sistema está saudável e quando intervir. Distinto de observability (capacidade), monitoring é o processo de **olhar** e **reagir**.

## Essência
- **SLI (indicator):** métrica observável (latência p95, taxa de erro 5xx, disponibilidade).
- **SLO (objective):** alvo (latência p95 < 300ms 99% das janelas de 30 dias).
- **Error budget:** `1 - SLO`. Consome budget → freezes em releases até recuperar.
- **Sinais Golden (Google SRE):** Latency, Traffic, Errors, Saturation.
- **RED** (Rate, Errors, Duration) para serviços; **USE** (Utilization, Saturation, Errors) para recursos.
- **Alertas:** baseados em **sintoma** (user-visible) > causa (CPU alta). Cada alerta tem runbook.
- **Alert fatigue:** se dispara sem ação, é ruído — silencie ou ajuste threshold. Cada alerta deve ser acionável.
- **Burn rate alerts** para SLO: detecta queima rápida do budget (e.g., gastando 10% do budget mensal em 1h).
- **Dashboards:** por serviço (overview) + por incident (debugging). Curto, focado.
- **On-call:** rotação clara; runbook por alerta; escalation path.
- **Synthetics / health checks** externos para detectar problema antes do user.
- **Stack típica:** Prometheus + Grafana, Datadog, New Relic, Cloud Monitoring (GCP), CloudWatch (AWS).

## Procedimento mínimo
1. Definir 3-5 SLIs críticos por serviço (latência, error rate, disponibilidade, saturação).
2. SLOs realistas (não 100%); error budget calculado.
3. Alertas por sintoma (user-impacting) + burn-rate alertas para SLO.
4. Runbook por alerta: o que verificar, como mitigar, quando escalar.
5. Dashboard "overview" do serviço para on-call.
6. Revisão mensal de alertas: silenciados, fatigantes, ausentes.

## Anti-patterns
- Alerta em CPU > 80% que dispara toda noite → fadiga; alertar em latência/error percebida.
- SLO 100% → vai violar; alvo realista (99.9% serviços críticos, 99% gerais).
- Alerta sem runbook → on-call não sabe agir.
- Dashboard de 50 gráficos → ninguém olha; foco no que decide ação.

## Mini-exemplo
```yaml
# SLO: 99.5% das requests /v1/* abaixo de 500ms em 30 dias
sli: histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{route=~"/v1/.+"}[5m])) by (le))
slo_target: 0.995
budget_remaining_alert:
  expr: error_budget_remaining < 0.1
  for: 15m
  severity: warning
fast_burn_alert:
  expr: error_budget_burn_rate_1h > 14
  for: 5m
  severity: page
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/processes/monitoring.md`
