---
name: BQML toggle terminology decision
description: Toggle "BigQuery ML" renamed to "Modo Preditivo" in chat interface — rationale, alternatives, expanded scope covering segmentation/explainability/regression
type: project
---

Toggle "BigQuery ML" no chat /explore foi renomeado para **"Modo Preditivo"**.

Tooltip (v2 — escopo expandido): "Ativa modelos que projetam cenários futuros, segmentam contratos por perfil de risco e mostram quais variáveis mais impactam os resultados."

Tooltip anterior (v1 — só previsão): "Liga modelos de previsão que projetam o comportamento futuro da carteira — inadimplência, tendências e cenários de estresse."

Capacidades cobertas pelo toggle:
- Previsão/Classificação (BOOSTED_TREE, LOGISTIC_REG, DNN)
- Forecast temporal (ARIMA_PLUS)
- Segmentação (KMEANS)
- Regressão (LINEAR_REG, BOOSTED_TREE_REGRESSOR)
- Explicabilidade (ML.EXPLAIN_PREDICT)

Alternativas consideradas e descartadas (rodada 1 + rodada 2):
- "Análise Inteligente" — implica que modo normal não é inteligente
- "Modo Avançado" — genérico, pode intimidar
- "Modelos e Projeções" — "Modelos" soa acadêmico
- "Insights Preditivos" — "Insights" virou buzzword
- "Análise Preditiva" — ligeiramente acadêmico
- "Projeções e Previsões" — longo demais
- "Visão de Futuro" — marketeiro
- "Modelos Avançados" — deprecia o modo normal

**Why:** "Preditivo" é termo que gestores de fundos e analistas de crédito já usam no dia a dia (relatórios de risco, PDD, scoring). O rótulo comunica a direção (futuro/projeção); o tooltip cobre o escopo completo. Consistente com `predictive_agent: 'Projetando tendências'` já na interface.

**How to apply:** Usar "preditivo" como termo padrão para capacidades de ML/forecast em toda a interface. Nunca expor "BigQuery ML", "BQML", "machine learning" ou nomes de modelos (ARIMA, LOGISTIC_REG, KMEANS) no nível 1 da hierarquia. Tooltip deve sempre mencionar as três dimensões: projeção, segmentação, explicabilidade.
