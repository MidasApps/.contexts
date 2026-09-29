---
name: OM acumulado mode audit results
description: Comprehensive audit comparing BigQuery queries against Looker screenshots for OM client accumulated mode - identifies matches and mismatches
type: project
---

Audit conducted 2026-03-16 comparing 25 Looker screenshots against BigQuery queries for OM (dataset: bq-data-wh.om_monitor).

**Key findings:**
- Period: 2025-05-31 to 2026-01-31 (9 monthly snapshots, 930 rows, 131 distinct contracts)
- Acumulado mode: queries use `WHERE data_base_report BETWEEN start AND end`, with COUNT(DISTINCT id_contrato) for contract counts and SUM() for monetary values

**All matching telas:**
- Dashboard KPIs (131 contratos, R$ 877,44 mi saldo, 0,24% inadimplencia)
- Empreendimentos (AUTORIA: 85, BOSSA: 46 - all monetary values match)
- Faixa de Atraso (all 6 faixas match exactly)
- PDD por Rating (all 8 ratings match for pdd_liquid, pdd_minimo_bacen, delta_pdd)
- Restricoes por Rating (all values match)
- Restricao por Tipo (3 categories match)
- Faixas de Restricoes (bar chart matches)
- Matriz de Cobranca (all rows match exactly)
- Grupos Repasse G1-G8 (all match)
- Simulacao LTV Banco (825 contratos > 80%, R$ 827,2 mi)
- Rating x Empreendimento (uses COUNT(DISTINCT id_contrato) per rating, allowing sum > total distinct because contracts migrate between ratings across months; AUTORIA total=183, not 85)

**Mismatches found:**
1. **Pricing Desagio**: Screenshot shows -10,35% total, query returns -10,91%. Absolute pricing values (SUM) match, but the percentage calculation diverges. Likely the Looker calculates desagio differently (possibly per-contract average vs ratio of sums).
2. **LTV calculation**: Screenshot shows 86,58% (total), query AVG(ltv) gives different result because AVG is over all 930 rows not 131 distinct contracts. The Looker likely uses a weighted or last-snapshot LTV.
3. **Valor Imovel in Empreendimentos**: Minor presentation differences in abbreviated values.

**Why:** This audit validates whether the DataViz "acumulado" mode produces the same results as the Looker. Critical for client acceptance.

**How to apply:** When implementing acumulado mode, use COUNT(DISTINCT id_contrato) for contract counts, SUM for monetary fields, and be careful with AVG/ratio calculations that behave differently when aggregating across multiple snapshots.
