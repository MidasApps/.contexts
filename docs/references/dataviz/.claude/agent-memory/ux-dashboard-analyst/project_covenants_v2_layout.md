---
name: Covenants v2 Layout Conventions
description: Grid/colSpan mechanics and block rendering gotchas for the 13 covenants-v2-* Vila Rosa templates (scripts/templates/)
metadata:
  type: project
---

Os 13 templates `scripts/templates/covenants-v2-*.template.mjs` (Vila Rosa, covenants de financiamento imobiliário) renderizam num grid de 6 colunas (`grid grid-cols-6`), cada bloco com `colSpan` 1–6, agrupados em `layout[]` de rows. Cada row deve somar 6.

Convenções observadas (bom padrão): 2 KPIs por row = colSpan 3 cada; 3 KPIs por row = colSpan 2 cada. `empreendimento` é o exemplar (6 rows de 3×colSpan2). `unidades`/`inadimplencia`/`certidoes` usam 2×colSpan3.

**Gotchas de renderização confirmados (código-fonte):**
- `GaugeBlock.tsx` NÃO é um dial radial — é um card colorido (label + valor grande + "Mín. X"), com borda/cor condicional por tone (verde/âmbar/vermelho via `classify()`). Logo: destaque de gauge vem da COR, não da largura. Alargar além de colSpan 3 só adiciona espaço vazio. Manter gauges de enquadramento em colSpan 2–3.
- `SingleKpiBlock` → `RichKpiCard` (KpiCard.tsx): header = icon + label + trend badge na mesma linha flex, label SEM truncate (quebra em várias linhas). A colSpan 1 (~108px úteis após padding) labels de 2+ palavras quebram feio ("Contratos Distratados"). Regra: KPI com label de 2+ palavras deve ser colSpan ≥2.
- `RichKpiCard` SEMPRE renderiza um badge neutro "— 0%" (tooltip "Sem variação vs mês anterior") quando não há `trend`/sparkline — que é o caso de TODOS os KPIs snapshot destes templates. Sugere falsamente comparação MoM = zero (risco de leitura errada, ex. "inadimplência não mudou"). Fix seria no componente (suprimir badge neutro sem dado), cross-cutting.
- `DonutBlock.tsx`: chart fixo em 160×160px; largura extra vai só p/ os legend cards laterais. Legend cards mostram moeda COMPLETA (`formatValue`, não abrevia como o centro) → a colSpan 2 os valores R$ (Pré/Pós ~R$70mi) espremem. Donut com `showLegendCards + currency` fica melhor em colSpan ≥3.

**Why:** Auditoria UX de diagramação (jul/2026, branch feat/vila-rosa-covenants-v2) pediu ajuste fino de colSpan por row. Referência de layout = Looker original (docs/bases/vila-rosa/MAPEAMENTO.md §6).

**How to apply:** Ao criar/ajustar rows destes templates, somar colSpan=6; evitar colSpan 1 em KPI com label longo; não alargar gauge além de 3; considerar donut≥3 quando tiver legend cards de moeda. Ver [[project_liquid_dataviz]].
