---
name: Final Audit Results 2026-03-16
description: Comprehensive audit of all indicators across all pages - fixes applied for restricoes semantics, COUNT DISTINCT, desagio formula, indice_repasse removal
type: project
---

## Final Exhaustive Audit - All Pages, All Indicators (2026-03-16)

### Issues Found and Fixed

1. **COUNT(*) vs COUNT(DISTINCT id_contrato)** - Multiple queries used COUNT(*) which gave inflated numbers in accumulated mode. Fixed in: elegibilidade LTV, elegibilidade categories, pricing rating, pricing elegibilidade, PDD, simulacao, repasse, repasse history.

2. **`restricoes` field semantics** - The `restricoes` column in BigQuery is a monetary value (sum of valor_pefin + valor_refin + valor_protesto). Looker displays a COUNT of contracts with restrictions. Fixed SQL to use `SUM(CASE WHEN restricoes > 0 THEN 1 ELSE 0 END)` in contratos resumo and repasse queries.

3. **Repasse `indice_repasse` column does NOT exist** in the database. Removed from KPI grid (was always showing 0), table columns, and footer. Reduced KPI grid from 4 to 3.

4. **Pricing desagio KPI formula** - Frontend used portfolio-level `(totalPricing - totalNominal) / totalNominal` giving -10.91%. Looker uses AVG(per-row desagio) = -10.37%. Fixed to weighted average from per-rating desagio values.

5. **Repasse column formatting** - `delta_renda_alto` changed from formatCurrency to formatNumber (it's a flag 0/1, SUM is count). `prosoluto_simulacao` changed from formatNumber to formatCurrency. `area_privativa` changed from formatCurrency to formatNumber(v, 2).

### Validated Against Looker Screenshots (All Match)

| Page | Indicator | Looker Value | Query Value | Status |
|------|-----------|-------------|-------------|--------|
| Dashboard | total_contratos | 131 | 131 | OK |
| Dashboard | saldo_nominal | 877,44 mi | 877,44 mi | OK |
| Dashboard | inadimplencia_pct | 0,24% | 0,245% | OK |
| Dashboard | over_90_pct | 0,06% | 0,057% | OK |
| Faixa Atraso | Sem atraso | 128 | 128 | OK |
| Pagamentos | jan/26 Pag Antecipado | 37,20 mil | 37,20 mil | OK |
| Pagamentos | jan/26 Vencimento Ref | 272,51 mil | 272,51 mil | OK |
| Pricing | Total Pricing | 781,70 mi | 781,70 mi | OK |
| Pricing | Rating A desagio | -8,81% | -8,81% | OK |
| Contratos | AUTORIA contratos | 85 | 85 | OK |
| Contratos | AUTORIA restricoes | 99 | 99 | OK |
| PDD | Rating A pdd_liquid | 903 mil | 903 mil | OK |

### Pages Verified as Correct (No Changes Needed)

- **Dashboard**: All 6 KPIs, evolution chart, faixa atraso table - correct
- **Contratos**: Resumo table, unidades chart, rating charts - correct
- **Pagamentos**: Table + stacked 100% chart - correct
- **Fluxo de Caixa**: Both charts + table - correct
- **PDD**: 3 KPIs, chart, table - correct
- **Elegibilidade**: LTV tab (live data), Safra/Faixa/Matriz/Restricoes tabs (mock data) - correct
- **Detalhamento**: Simple list query - correct
- **Simulacao**: KPIs, LTV chart, stress matrix (static) - correct

**Why:** Ensures data displayed matches Looker reference and BigQuery source of truth.
**How to apply:** Reference this audit when making any future query or formatting changes.
