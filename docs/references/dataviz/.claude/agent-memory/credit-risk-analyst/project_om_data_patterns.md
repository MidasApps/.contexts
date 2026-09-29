---
name: OM client data patterns and field mappings
description: Key findings about OM dataset structure, field naming, and calculation conventions discovered during screenshot vs code audit
type: project
---

OM client (dataset: bq-data-wh.om_monitor) has specific data conventions:

- **faixa_atraso_1**: Uses "00. Sem atraso", "01. 1 - 5 dias", "02. 6 - 30 dias", "03. 30 - 60 dias", "04. 60 - 90 dias", "05. Acima de 90 dias" format (not the generic "Adimplente", "1 a 30" etc.)
- **faixa_ltv_banco**: Used for Simulacao page, NOT faixa_ltv. Categories are "1. 10% a 20%", "2. 20% a 30%", ..., "9. > 90%"
- **LTV stored as percentage**: ltv values are 85.69, 88.43, etc. (not fractions like 0.8569)
- **restricoes**: Numeric count of total restrictions per contract (not a boolean flag). SUM(restricoes) can exceed contract count.
- **grupos_repasse**: Uses G1-G8 nomenclature (8 groups), combining: Restriction (Sem/Com), LTV Banco (< 80% / > 80%), Renda (Suficiente/Insuficiente)
- **delta_renda_baixo/medio/alto**: Separate numeric columns (not a single categorical delta_renda field)
- **prosoluto_simulacao, prosoluto_cnpj, prosoluto_sem_informacao**: Direct numeric columns in contratos table
- **correcao_monetaria**: Categorical field (IGPM, IPCA, etc.), COUNT(DISTINCT) gives meaningful values per rating group
- **Pagamentos tipo_recebimento**: Has 4 distinct categories: "Pagamento antecipado", "Vencimento na referencia", "Recuperacao mes anterior", "Recuperacao anterior" (last two are separate)
- **Portfolio size**: ~131 contracts across 2 projects (AUTORIA BY ORNARE: 85, BOSSA OM HOME: 46)

**Why:** These patterns were discovered by comparing 25 screenshots from the original Liquid platform against the DataViz application code. Mismatches in field names and calculation methods caused incorrect display values.

**How to apply:** When working on OM-related queries or any client-specific data, check field naming conventions in the types file and use faixa_atraso_1 for faixa grouping, faixa_ltv_banco for simulation, and separate pagamentos categories.
