---
name: monitoring
description: "Use ao configurar/investigar monitoring, alertas, dashboards. Keywords: monitoring, alerts, sli, slo."
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
- **Burn rate alerts** para SLO: fast (1h consome 2% do budget mensal) → P1; slow (6h consome 5%) → P2.
- **5xx — uma tabela só** (em `processes/monitoring.md`): SLO < 1%; page P1 em > 1% por 5 min ou > 5% em 1 min; nos 30 min pós-deploy, baseline + 1 p.p. dispara rollback automático. Deploy e rollback não inventam outro número.
- **Dashboards:** por serviço (overview) + por incident (debugging). Curto, focado.
- **On-call:** rotação clara; runbook por alerta; escalation path.
- **Synthetics / health checks** externos para detectar problema antes do user.
- **Stack canônica:** Cloud Monitoring + Cloud Logging, OpenTelemetry → Cloud Trace, Sentry (erros), Langfuse (LLM), PagerDuty (on-call), status page. Ferramenta nova entra por ADR.

## Procedimento mínimo
1. Definir 3-5 SLIs críticos por serviço (latência, error rate, disponibilidade, saturação).
2. SLOs a partir dos defaults do projeto (99.9% disponibilidade crítica, p95 < 800 ms, 5xx < 1%, TTFT < 1 s); desvio exige ADR. Error budget calculado.
3. Alertas por sintoma (user-impacting) + burn-rate alertas para SLO.
4. Runbook por alerta: o que verificar, como mitigar, quando escalar.
5. Dashboard "overview" do serviço para on-call.
6. Revisão mensal de alertas: silenciados, fatigantes, ausentes.

## Anti-patterns
- Alerta em CPU > 80% que dispara toda noite → fadiga; alertar em latência/error percebida.
- SLO 100% → vai violar; use os defaults (99.9% para serviços críticos).
- Alerta sem runbook → on-call não sabe agir.
- Dashboard de 50 gráficos → ninguém olha; foco no que decide ação.

## Mini-exemplo
```yaml
# Esquemático (independente de ferramenta; implementar em Cloud Monitoring SLO)
slo: availability /v1/*  target: 0.999  window: 30d   # budget = 0.1%
alerts:
  - name: fast_burn   # 1h consome 2% do budget mensal (burn rate ≈ 14.4)
    severity: P1      # PagerDuty page + #incidents
  - name: slow_burn   # 6h consome 5% do budget mensal (burn rate ≈ 6)
    severity: P2      # PagerDuty notify + #alerts
  - name: http_5xx_sustained  # > 1% por 5 min
    severity: P1
runbook: link obrigatório em cada alerta
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/processes/monitoring.md`
