---
name: business-model
description: Use em decisões de produto/feature que dependem do modelo de negócio. Keywords: business model, revenue, monetização.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Business Model

Documento que descreve **como o produto cria, entrega e captura valor**. Carregue antes de decisões que afetam monetização, pricing, segmentação, prioridade de features.

## Essência
Conteúdo típico de um documento de business model (ver `@`):
- **Value proposition:** o problema resolvido, para quem, e por que essa solução é melhor que alternativas.
- **Revenue model:** como o dinheiro entra — SaaS subscription, transaction fee, usage-based, marketplace take rate, licença, freemium, ads.
- **Pricing:** tiers, métricas (per-seat, per-API-call, per-tenant), trial/free, anchor.
- **Unit economics:** CAC, LTV, payback period, gross margin, churn — números atuais e alvos.
- **Customer segments:** quem é o cliente que paga; quem é o usuário (pode ser diferente).
- **Channels:** como o produto chega ao cliente — self-serve, sales-led, PLG, partnerships.
- **Cost structure:** principais custos (infra, modelos AI, salários, marketing).
- **Key partnerships:** dependências externas críticas (cloud, modelos, integrações).
- **Moat / defensibility:** o que torna difícil copiar — dado, rede, switching cost, marca.

## Procedimento mínimo
1. Ler o `@` deste skill para entender modelo específico deste projeto.
2. Em decisão de feature/pricing, verificar:
   - alinha com value proposition?
   - afeta unit economics (margem, CAC)?
   - serve segmento que paga?
   - cria/protege moat ou destrói?
3. Em mudanças de produto que afetam revenue, citar impact esperado nos números relevantes.

## Anti-patterns
- Decidir feature "porque seria legal" sem cruzar com business model → product debt.
- Otimizar engagement sem olhar revenue → vanity metrics.
- Ignorar custo unitário (e.g., custo de inferência LLM por usuário) → margem negativa em escala.
- Assumir pricing fixo quando segmento mudou → deixar dinheiro na mesa ou afugentar.

## Mini-exemplo
Documento típico estruturado em seções: Value Proposition; Customer Segments; Revenue Model; Pricing; Unit Economics; Channels; Cost Structure; Partnerships; Moat. Cada seção curta, com números atuais e alvos quando aplicável. Versionado em `@.contexts/business/business-model.md`; atualizado quando mudanças significativas.

---
**Detalhes/convenções específicas do projeto:** `@.contexts/business/business-model.md`
