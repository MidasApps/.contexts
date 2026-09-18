---
name: icp
description: Use ao raciocinar sobre Ideal Customer Profile e segmentação. Keywords: ICP, persona-empresa, segmentação.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# ICP (Ideal Customer Profile)

Descrição do **tipo de empresa/usuário** que melhor se beneficia do produto e melhor monetiza para o negócio. Não é toda persona possível — é a interseção de "tem dor", "valoriza solução" e "paga".

## Essência
Conteúdo típico de um documento de ICP (ver `@`):
- **Firmographics (B2B):** tamanho (funcionários, receita), indústria, geografia, maturidade, stack tecnológico.
- **Demographics (B2C):** idade, ocupação, renda, geografia, tecnologia familiar.
- **Triggering events:** o que faz o ICP entrar no mercado agora (ex.: novo cargo, regulação, fundraising, crescimento >X%).
- **Pain points:** problemas específicos sentidos com intensidade — preferível "número que dói" (custo, tempo perdido, risco).
- **Buying journey:** awareness → consideration → decision; quem é decisor, influenciador, usuário.
- **Anti-ICP:** quem **não** é o cliente — segmentos a deprioritizar (pode trazer churn, baixa LTV, drenagem de suporte).
- **Distribuição de tiers:** ICP-A (alvo principal), ICP-B (secundário), edge cases.
- **Indicadores quantitativos:** % de pipeline que bate ICP, win rate por segmento, NRR por segmento.
- **Sinal de fit:** o que o cliente diz/faz quando o produto resolve a dor real.

## Procedimento mínimo
1. Ler `@` para o ICP atual do projeto antes de decisão de feature/marketing/sales.
2. Em decisão de feature: pergunta "qual ICP isso atende? está no alvo?".
3. Em onboarding/marketing: validar que mensagem fala com triggers/pain do ICP.
4. Em descoberta de novo segmento: hipótese → entrevista → ajuste de ICP, não inverso.

## Anti-patterns
- Construir para todos → produto vira indistinto.
- ICP só por firmographics, sem pain/trigger → mira torta.
- Ignorar anti-ICP e fechar deal "porque é receita" → churn alto, suporte caro.
- ICP "imaginário" sem dados de clientes reais → vaidade.

## Mini-exemplo
Documento típico contém: Definição (1 parágrafo); Firmographics/Demographics; Triggers; Pain points (top 3-5); Anti-ICP; Distribuição por tier; Métricas de validação. Atualizado quando aprendizagem significativa chega de sales/customer success. Versionado em `@.contexts/business/icp.md`.

---
**Detalhes/convenções específicas do projeto:** `@.contexts/business/icp.md`
