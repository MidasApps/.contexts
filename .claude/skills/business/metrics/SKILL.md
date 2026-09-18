---
name: metrics
description: Use ao avaliar métricas de negócio (north-star, KPIs). Keywords: metrics, kpi, north star.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Business Metrics

Conjunto de métricas que dizem se o negócio está saudável e em que direção. North Star (a métrica de cima), input metrics (alavancas), guardrails (não-piorar).

## Essência
- **North Star Metric (NSM):** UMA métrica que melhor captura valor entregue + crescimento. Não é receita per se — é o que LEVA à receita ("weekly active teams that completed a workflow").
- **Input metrics (drivers):** alavancas que movem NSM (activation rate, retention week-1, average usage/user).
- **Guardrails:** métricas que não podem piorar mesmo com NSM crescendo (margin, NPS, error rate, support tickets/user).
- **Métricas SaaS típicas:** MRR/ARR, churn (gross/net), NRR, CAC, LTV, payback, MoM/YoY growth, activation rate, retention curve.
- **AARRR (pirate metrics):** Acquisition → Activation → Retention → Referral → Revenue. Funil de engajamento.
- **Cohort analysis:** retention por coorte de signup; identifica se produto está melhorando para novos users.
- **Leading vs lagging:** leading prediz (signup velocity), lagging confirma (revenue trimestre passado). Otimize leading.
- **Vanity metrics vs actionable:** pageviews, registered users → sem ação. Active users que retornam → ação.
- **Definições versionadas:** "active user" muda significado entre times — definição canônica documentada.
- **Dashboards:** north-star + input + guardrails em um lugar; revisão semanal/mensal cadenciada.

## Procedimento mínimo
1. Ler `@` para identificar NSM e métricas oficiais deste projeto.
2. Em decisão de feature: pergunta "qual input metric isso move? qual guardrail pode piorar?".
3. Mudança de definição de métrica → versionar (`metric@v2`) e anotar break no dashboard.
4. Antes de quote'ar número, verificar fonte canônica (data warehouse, não planilha desatualizada).
5. Distinguir leading (preditiva) de lagging (confirmatória) ao recomendar foco.

## Anti-patterns
- Otimizar vanity (downloads) sem efeito em revenue/retention.
- Mudar definição silenciosamente → comparações temporais ficam erradas.
- Dashboard com 50 métricas → ninguém olha; priorize 5-10.
- North Star = receita do mês → pressão de curto prazo distorce decisões.

## Mini-exemplo
Documento típico lista: NSM com definição precisa; Input metrics (3-5) com fórmula; Guardrails (3-5) com limite; SaaS KPIs (MRR, NRR, churn, CAC, LTV); cadência de review; fonte de verdade (warehouse table, dbt model). Versionado em `@.contexts/business/metrics.md`.

---
**Detalhes/convenções específicas do projeto:** `@.contexts/business/metrics.md`
