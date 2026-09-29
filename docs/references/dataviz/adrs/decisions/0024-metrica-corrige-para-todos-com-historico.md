---
id: 0024
title: Correção de métrica vale para todas as páginas — intenção declarada, histórico e desfazer
status: Accepted
date: 2026-08-18
deciders: [giulliano.soares]
consulted: [time-ai]
informed: [time-eng, time-produto]
tags: [ai, metricas, catalogo, versionamento, auditoria, arquitetura]
related: [0015, 0022, 0023]
---

# ADR-0024 — Corrigir métrica melhora todas as páginas

## Status

Accepted — 2026-08-18.

## Contexto

A ADR-0023 deu ao assistente a capacidade de criar e alterar métrica, com uma
política única para alteração: **na dúvida, variação**. Métrica usada em outra
página, ou pertencente ao catálogo compartilhado, nunca era editada — nascia um
documento novo e a original ficava intacta.

Conservadora, e errada no caso mais comum.

Alteração de métrica é de dois tipos, e eles são opostos:

- **Correção** — o SQL somava errado, faltava tratar a caixa do status, o
  `SAFE_CAST` estava na coluna errada. A métrica continua medindo a MESMA
  coisa. Variar aqui é o pior resultado possível: a métrica errada segue viva
  nas três páginas em que estava e nasce uma quarta, certa. Duas telas passam a
  mostrar números diferentes sob o mesmo nome, sem como saber em qual
  acreditar. Métrica é compartilhada justamente para o acerto chegar a todos.
- **Redefinição** — "quero por mês em vez de posição", "só pós-chaves", "por
  m²". Não é melhoria: é outra medida com o mesmo nome. Editar quebra quem
  usava a definição anterior.

As duas são indistinguíveis olhando o SQL — a diferença está na intenção de
quem pediu, que o modelo lê no enunciado ("está errado, o certo é X" × "quero
ver por mês").

Havia ainda três lacunas de governança na 0023, encontradas ao revisar:
`version` era escrito em três lugares e lido em nenhum; alterar apagava o que a
métrica era, sem histórico nem rollback; e o caminho do chat não usava
`auditFields`, sendo a única escrita do sistema sem registro de autoria desde o
achado R19.

## Decisão

**1. `update_metric` exige `intencao`.** Declarada, não inferida do uso.

| | métrica do cliente | métrica global (Liquid) |
|---|---|---|
| `corrigir` | edita no lugar e vale para TODAS as páginas | recusa — atravessa clientes, é da administração |
| `redefinir` | variação (ou edição, quando só a página aberta usa) | variação |

Redefinir o que só a página aberta usa continua editando no lugar: variar ali
deixaria para trás uma métrica órfã, que o bloco deixa de apontar no passo
seguinte.

**2. Correção que alcança página fechada pede confirmação.** A primeira chamada
devolve o alcance (`CONFIRMACAO_NECESSARIA` + a lista de páginas) e não grava; o
assistente conta ao usuário e chama de novo com `confirmado: true`. É o mesmo
contrato de dois passos já usado na construção de página: mexer no relatório de
outra pessoa se avisa antes, não se descobre depois.

**3. Corrigir métrica global não sai do chat.** A correção estaria certa — e é
por isso que não pode sair dali: `covenants.*` é catálogo da Liquid e o alcance
é toda a base de clientes. A ferramenta recusa e encaminha à administração,
oferecendo uma versão corrigida só para aquele cliente via `redefinir`.

**4. Histórico em `metrics/{id}/revisions`.** Toda sobrescrita arquiva o
documento anterior inteiro (não um diff — o registro precisa se bastar para
restaurar, e diff exigiria a cadeia completa desde o começo, que não existe para
o catálogo atual). Id automático, ordem por `archivedAt`: o formulário da
administração grava sem incrementar `version`, e duas edições por lá
colidiriam sob a mesma chave.

**5. O histórico é da métrica, não do caminho.** `POST /api/metrics` arquiva
também — uma edição pela administração sumiria do registro se só o chat
arquivasse.

**6. `revert_metric`.** Restaura a revisão anterior em todas as páginas, e
arquiva o estado atual antes: desfazer o desfazer funciona. É o que torna a
correção compartilhada uma operação aceitável — sem ela, propagar transforma um
engano em incidente.

**7. Procedência e autoria.** `origin` (`chat` | `admin`) e `derivedFrom` entram
no `MetricDoc`; `auditFields` passa a valer também no caminho do chat. O
`POST /api/metrics` preserva `origin`/`derivedFrom` do documento existente, do
mesmo modo que já preservava `ownerClientId` — ele reconstrói o doc com
`merge: false`, e salvar pela admin apagaria a origem de uma métrica criada na
conversa.

**8. `version` deixa de ser enfeite** e passa a ser o número da revisão. Segue
sem efeito no runtime: bloco aponta para métrica por id, nunca por versão.

## Consequências

**Positivas.** Correção chega a quem precisa dela sem ninguém ter que caçar
página por página. Deixa de existir a divergência silenciosa de duas métricas
quase iguais com números diferentes. Toda alteração é reversível e tem autor.
"De onde veio esta métrica?" passa a ter resposta.

**Negativas.** Uma correção confirmada muda o número de páginas que ninguém
abriu para conferir — é a decisão, não um efeito colateral, e o antídoto é o
par confirmação + desfazer. O acerto entre `corrigir` e `redefinir` depende do
modelo classificar certo o pedido; quando o enunciado é ambíguo ele deve
perguntar, e o prompt manda perguntar.

**Custo.** Uma escrita a mais por alteração (nenhuma na criação). As revisões
acumulam sem expurgo — são documentos pequenos, e perder histórico por TTL
anularia o ponto.

**Sem migração.** Métrica sem `revisions` simplesmente não tem o que desfazer, e
`revert_metric` diz isso. `origin` ausente significa "cadastrada fora do chat".

## Alternativas consideradas

- **Inferir correção × redefinição pelo diff do SQL.** Rejeitada: `SUM` virando
  `SUM(SAFE_CAST(...))` pode ser conserto de tipo ou mudança de base, e o texto
  não distingue. Quem sabe é quem pediu.
- **Bloco apontar para `metricId@versão`.** Rejeitada: congelar versão por bloco
  desfaz o compartilhamento — recria exatamente o problema que a política de
  variação resolve, e multiplica documento sem limite.
- **Sempre pedir confirmação, mesmo na página aberta.** Rejeitada: corrigir o
  que se está olhando não precisa de cerimônia, e confirmação que vira hábito
  deixa de ser lida.
- **Guardar diff em vez do documento.** Rejeitada: exige cadeia completa desde a
  origem, que não existe para as 64 métricas já em produção.
- **Ciclo de rascunho/publicação com aprovação.** Fora de escopo: é produto, não
  a lacuna atual.
