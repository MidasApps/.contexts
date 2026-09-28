---
name: UX Sprint 2 Patterns
description: Patterns and conventions established during Sprint 2 UX review — title consistency, InfoTooltip usage, subtitle conventions, error message standardization
type: project
---

Sprint 2 UX Writing review established the following conventions:

**Page Titles**: Single-line h2, `text-foreground` class, no `<br/>` splits or two-color patterns. Subtitle in `text-white/40` below.

**InfoTooltip**: Component updated to accept both `term` (glossary key) and `text` (freeform) props. Used on Dashboard KPI labels alongside glossary terms.

**Chart/Table Subtitles**: Every ChartWidget and DataTableWidget should have a `subtitle` that explains what the user will find — not just the metric name but the analytical context (e.g., "Saldo devedor por rating ao longo do tempo" instead of just "Evolução do Saldo Devedor").

**Error Messages**: Standardized across all pages to `rounded-xl border-[#F27C7C]/15 bg-[#F27C7C]/5 text-[#F27C7C]` styling. Copy: "Não foi possível carregar os dados do servidor. Exibindo dados locais." (or "Verifique sua conexão..." when no fallback data).

**Tab Labels**: Should hint at content within (e.g., "Por Rating Liquid" not just "Rating", "Unidades Comercializadas" not just "Unidades").

**KPI Subtitles**: Used `subtitle` prop on KpiCard to add brief contextual explanations below the value.

**Glossary Terms Added**: pdd_minimo_bacen, pdd_liquid, prazo_decorrido, total_contratos, pricing, indice_repasse, restricao, pagamento_antecipado, vencimento_referencia, recuperacao.

**Why:** The Sprint 1 review fixed mechanics (accents, R$, contrast) but left copy vague. Users (fund managers, analysts) need immediate contextual understanding of each number.

**How to apply:** When adding new pages or widgets, follow these subtitle/tooltip/error conventions. Always provide a descriptive subtitle on charts and tables.
