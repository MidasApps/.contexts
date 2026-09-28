---
id: 0027
title: A carteira é temporal — todo indicador segue o mês escolhido, e todo KPI mostra sua trajetória
status: Accepted
date: 2026-08-19
deciders: [giulliano.soares]
consulted: [time-ai]
informed: [time-eng, time-produto]
tags: [periodo, metricas, kpi, comparativo, arquitetura]
related: [0015, 0025, 0026]
---

# ADR-0027 — A carteira é temporal

## Status

Accepted — 2026-08-19.

Histórico:
- 2026-08-19 — proposta e aceita pelo dono do produto na sessão em que a
  medição foi feita.

## Contexto

O dono do produto formulou o requisito em uma frase: *"se eu quero saber a saúde
de agosto, eu vou ter o número de agosto. Se eu quero saber a saúde de julho, eu
posso ver a evolução da saúde. Precisamos garantir olhar a carteira mensalmente
e não uma visão 'hoje' e sim 'temporal'."*

A investigação que respondeu a isso começou errada, e o erro faz parte do
contexto porque explica dois dos três defeitos.

### O que se acreditava

Que 60 dos 91 blocos do Vila Rosa eram uma visão "hoje": fixados em
`MAX(data_base_report)` sobre a tabela inteira, imunes ao seletor de período.
A crença tinha fonte — o docblock de `sensibilidade-ao-periodo.ts` afirmava
"nenhum filtro do app alcança esse pin".

### O que o dado diz

A frase era verdadeira antes de `patch-covenants-snapshot-pin.mjs`, que já
rodou. O pin de hoje é:

```sql
WHERE data_base_report = (
  SELECT MAX(data_base_report) FROM {t} WHERE {filter.ate}
)
```

O `MAX` é calculado DENTRO da faixa. Medido no catálogo: **45 de 45** métricas
de posição têm o `{filter.ate}`; nenhuma tem pin cego. E o número se move —
`covenants.indice_recebivel` vale 12,06 com o período terminando em mai/26, 8,31
em jun/26 e 7,00 em jul/26.

O requisito, portanto, já estava atendido no essencial: escolher agosto dá o
número de agosto. O comentário desatualizado é o que fez a leitura errada
sobreviver — e, pior, é o que sustentava um defeito em produção.

### Os três defeitos reais

**1. O selo de variação nunca apareceu em lugar nenhum.** A guarda de
`aplicaComparativoAoBloco` perguntava `reageAoPeriodo()`, que só reconhece
`{filter.date_range}`. Os 45 pins reprovavam. Como quem sabe desenhar o selo é
exatamente KPI, medidor e progresso — e todos os 46 KPIs e 4 medidores do Vila
Rosa são pins —, o controle "Comparar" disparava a segunda consulta, recebia o
número do outro mês e descartava o resultado.

**2. Nenhum KPI mostrava trajetória.** 0 de 46 declaravam `sparklineMetricId`. O
caminho de render existia inteiro e vazio: `SingleKpiBlock` já passava
`sparklineData`/`sparklineMonths` ao `KpiCard`, e o modal já tinha o texto
"Dados históricos não disponíveis". O cartão dizia "7,00" sem contar que era
12,06 dois meses antes — 42% de queda invisível.

**3. Três métricas eram cegas ao período**, em 6 blocos: a série mensal de
transações (sem cláusula de data nenhuma) e as duas curvas de venda, que liam a
união de todos os snapshots. As outras 4 sem data estão corretas: saem de
`ficha_cadastral`, que tem UMA linha e nenhuma coluna de data — VGV, Total de
Unidades, Previsão de Entrega e Valor Contratado são fatos do projeto.

## Decisão

**1. "Segue o fim do período" é uma pergunta distinta de "reage ao período", e
ganha predicado próprio.** `segueOFimDoPeriodo()` reconhece `{filter.date_range}`
E `{filter.ate}`. `reageAoPeriodo()` continua respondendo a outra pergunta — "a
faixa inteira recorta esta consulta?" —, que é a que o modo Último mês/Todo o
período precisa. A guarda do comparativo passa a usar o predicado novo. Pin sem
`{filter.ate}` continua fora: ali as duas consultas voltam idênticas e o selo
afirmaria uma comparação que não houve.

**2. A série de um KPI de posição é DERIVADA do seu SQL, não escrita à mão.**
`serieMensalDoKpi()` troca o pin pela faixa e agrupa por mês; para as métricas
que escolhem uma linha por `ORDER BY … LIMIT 1` (medição de obra), gera
`QUALIFY ROW_NUMBER()` particionado por mês. O que ele não reconhece, RECUSA —
o KPI fica sem sparkline, que é o estado de hoje. Sparkline de menos é lacuna;
sparkline errada é uma curva inventada embaixo de um número certo.

**3. Nenhuma série é gravada sem passar num teste que só o dado responde: o
último ponto da série tem de ser igual ao valor que o KPI exibe.** Divergiu, é
descartada com os dois números no relatório. Série com menos de 2 pontos também:
uma sparkline de um ponto é um pixel, não uma trajetória.

**4. Série gerada que já exista no catálogo é REUSADA, não duplicada.** A
comparação é por SQL normalizado, não por nome — foi assim que
`covenants.inadimplencia_pct` encontrou `covenants.inadimplencia_serie`, cujo
nome não deriva do dela.

**5. As três métricas cegas ganham cláusula de data, cada uma a sua.** A série
de transações recorta por `{filter.date_range:transacoes.data_base_report}`,
como os dois vizinhos de página já faziam. As curvas de venda ganham o PIN, não
o recorte: a pergunta delas é histórica (vendas desde out/2024) e recortar a
emissão destruiria a curva; o que faltava era dizer de qual fotografia da
carteira ela é lida.

**6. A variação comparativa tem campo de direção próprio (`deltaDirection`).**
`trendDirection` pertence à sparkline e é escrito depois, no mesmo bloco.
Compartilhar o campo faria o card exibir a porcentagem de um período com a seta
do outro.

**7. O rótulo do modo descreve o RECORTE, não o resultado.** "Acumulado" virou
"Todo o período". A palavra prometia soma — verdade em 4 dos 9 blocos que o modo
alcança (as métricas de transação) e falsa nos outros 4, que agrupam por mês:
somá-los contaria o mesmo contrato uma vez por snapshot.

## Consequências

### Boas

- Os 46 KPIs e 4 medidores passam a poder exibir variação contra o período
  comparativo. Antes, zero.
- 38 dos 46 KPIs ganham trajetória mensal. Os 8 restantes são recusa correta:
  2 têm data como valor (série de datas não é leitura) e 6 são cadastrais.
- Blocos cegos ao período caem de 12 para 6, e os 6 que sobram são os
  cadastrais — a lista de "não reage" passa a ser inteiramente justificada.
- Toda série gerada foi provada contra o dado antes de existir.

### Custos e riscos

- O catálogo cresce de 66 para 95 métricas. As 29 novas são derivadas e não têm
  autor: se o KPI de origem mudar de SQL, a série NÃO acompanha sozinha. Quem
  editar um KPI de posição precisa reexecutar `add-kpi-sparklines.ts`, que é
  idempotente e reusa por SQL equivalente.
- A sparkline tem 3 pontos hoje (mai, jun, jul) — é a trajetória que existe no
  dataset, não uma limitação do desenho.
- `serieMensalDoKpi()` faz cirurgia textual em SQL. É por isso que a validação
  contra o dado é obrigatória e não opcional: o gerador não é confiável sozinho,
  e a ADR não pretende que seja.
- Curvas de venda agora respondem ao fim do período. Com o período aberto o
  resultado é idêntico ao de antes (medido: 188 contratos na união dos três
  snapshots, 188 só no de julho), então a mudança só aparece quando alguém
  recorta.

## Alternativas consideradas

**Derivar a sparkline em tempo de execução, sem métrica nova.** Evitaria as 29
métricas no catálogo, mas moveria a cirurgia textual em SQL para dentro do
caminho de request — onde não há como validar contra o dado antes de responder,
e onde um erro vira número errado na tela do usuário em vez de linha recusada
num relatório de migração.

**Corrigir `reageAoPeriodo()` em vez de criar predicado novo.** Rejeitada: o
predicado é consumido também por `aceitaRecorteDeMesUnico()`, que responde a
outra pergunta. Alargá-lo faria as 45 métricas de posição entrarem na partição
do modo "Último mês" sem que seu SQL mudasse — sem efeito visível, mas com o
significado do predicado corrompido, que é como este defeito nasceu.

**Deixar "Acumulado" e explicar bloco a bloco.** Rejeitada: o controle é único e
global à página; a explicação teria de ser repetida em cada bloco para desfazer
uma promessa que o próprio rótulo faz.
