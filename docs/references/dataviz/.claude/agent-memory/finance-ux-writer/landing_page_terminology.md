---
name: landing_page_terminology
description: Terminology decisions made for the landing page rewrite - C-level audience, no tech jargon
type: project
---

Landing page rewritten on 2026-03-18 for C-level audience (CEOs, CFOs, CROs of securitizadoras).

**Key terminology mappings:**
- "BigQuery ML + Vertex AI" -> "Inteligencia artificial aplicada"
- "ARIMA_PLUS" -> "projecoes estatisticas" / "modelos estatisticos"
- "8 agentes especializados" -> "A IA responde qualquer pergunta sobre sua carteira"
- "Sistema Multi-Agente" -> "Assistente Inteligente"
- "Dashboard Inteligente" -> "Painel Executivo"
- "IA Multi-Agente" -> "IA Conversacional"
- "Projecoes ARIMA+" -> "Projecoes Estatisticas"
- "Recomendacoes Prescritivas" -> "Recomendacoes Inteligentes"
- "Dados Macroeconomicos" -> "Cenario Macroeconomico"
- "Stack tecnologico" -> "Seguranca e infraestrutura"
- "Multi-client com isolamento total" -> "Uma plataforma, multiplas operacoes"
- "K-Means e otimizacao por ROI" -> "com base no retorno esperado"
- "ML.DETECT_ANOMALIES" -> "deteccao automatica de anomalias"
- "BOOSTED_TREE / LOGISTIC_REG / LINEAR_REG / K-MEANS" -> business labels (Risco de default, PD modelada, Impacto macro, Segmentacao)

**Rules applied:**
- Financial terms kept: CRI, CVM 60, covenant, LTV, PDD, WAL, excess spread, OC/IC, Selic, IPCA, CDI, PD
- All tech terms removed: BigQuery, BQML, Vertex AI, Next.js, Turbopack, Firebase, Recharts, ARIMA_PLUS, K-Means, LOGISTIC_REG, BOOSTED_TREE, LINEAR_REG, ML.DETECT_ANOMALIES
- Tech stack section transformed into security/infrastructure messaging

**Why:** C-level executives care about outcomes, not implementation details. Tech terms create friction and reduce credibility with non-technical decision-makers.

**How to apply:** Use these same mappings across all user-facing surfaces (tooltips, glossary, AI sidebar responses, export reports).
