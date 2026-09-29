---
id: 0023
title: A IA cria métrica — SQL de LLM validado por dry-run e variante em vez de edição compartilhada
status: Accepted
date: 2026-08-18
deciders: [giulliano.soares]
consulted: [time-ai]
informed: [time-eng, time-produto]
tags: [ai, metricas, catalogo, bigquery, seguranca, arquitetura]
related: [0013, 0015, 0019, 0020, 0022]
---

# ADR-0023 — A IA cria métrica

## Status

Accepted — 2026-08-18.

## Contexto

O assistente construía páginas (ADR-0020) mas só podia apontar os blocos para
métricas que já existiam no catálogo. Quando o indicador pedido não existia, as
saídas eram todas ruins, e as três aconteceram em produção:

- dizer que o indicador não está disponível (correto, e um beco sem saída);
- apontar o bloco para uma métrica parecida sem avisar (número errado exibido
  com confiança);
- **propor alterar uma métrica existente** — "converter `covenants.emp_estoque`
  para série" — sem saber que as 64 métricas `covenants.*` são **globais**
  (`ownerClientId: null`, seed `seed-covenants-v2-metrics.mjs:172`) e alimentam
  outros relatórios e outros clientes.

A máquina de criar já existia e estava desligada: `create-chat-metric.ts`
materializava uma métrica de SQL de LLM validando com `MetricDoc` antes de
gravar, e não tinha **nenhum chamador em produção** — sobra do fluxo de canvas
aposentado pela ADR-0020. O caminho de execução, esse, já estava pronto para
métrica de cliente: posse por `ownerClientId` (403 para métrica de outro),
gate de rota `/g`, e `maximumBytesBilled` que o próprio comentário justificava
citando SQL gerado por LLM.

O que faltava não era gravar. Era **provar que a métrica funciona antes de ela
entrar no catálogo**, e **decidir o que fazer quando alterar uma métrica
afetaria quem não pediu**.

## Decisão

Três ferramentas no supervisor: `list_metric_fields`, `create_metric`,
`update_metric`.

**1. Criar é sempre métrica nova.** Id `chat.<slug>`, `ownerClientId` do
cliente. Métrica global nunca é alterada pela conversa — nem por admin, porque
o alcance da mudança não é do cliente que está falando.

**2. Alterar decide entre editar e variar, olhando o uso real.** A varredura de
`clients/{id}/groups/*/reports/*` conta quem aponta para a métrica (qualquer
chave terminada em `metricId`, em qualquer profundidade). Métrica que não é do
cliente, ou que aparece em outra página ⇒ **variante**, com a original intacta
e o bloco reapontado. Só a página aberta usa ⇒ edita no lugar, com patch de
versão. Sem saber que página está aberta, o conservador vence: variante.

**3. Nada é gravado sem compilar.** Quatro portas em ordem — template (somente
leitura e sem tabela literal), documento (`MetricDoc`), compilação (**dry-run**
no BigQuery, resolvido contra o binding real do cliente, simulando os filtros
de página que `useReportData` manda) e colunas (os nomes devolvidos servem à
forma declarada). O `outputColumns` vem do schema do dry-run, não do que o
modelo declarou de memória.

**4. O template só fala pela entidade do contrato.** `{entidade}` e
`{entidade.atributo}`; tabela literal é recusada. Um doc de métrica que nomeia
dataset é um endereço de leitura fora do binding — e métrica FICA, executada
depois por quem abrir a página. O catálogo `covenants.*` tem duas exceções
literais (tabelas auxiliares), decisão de administração que não se estende ao
que a conversa cria.

**5. BigQuery permanece somente leitura.** `guardGeneratedSql` (SELECT/WITH,
comando único, denylist de DML/DDL/EXPORT/EXECUTE IMMEDIATE) e dry-run em vez
de execução. A métrica é documento Firestore (ADR-0013); nada é criado ou
alterado no BigQuery.

**6. A métrica criada volta a ser vista.** `getClientSemanticContext` passa a
somar as métricas com `ownerClientId == cliente` às que os produtos surfaçam —
elas não pertencem a produto nenhum. E o catálogo que as tools de bloco
conferem vira lista viva no turno, senão o `add_*_block` da linha seguinte
recusaria como inexistente a métrica recém-criada.

## Consequências

**Positivas.** O assistente deixa de ter um beco sem saída no pedido mais comum
("quero um indicador de X"). Métrica que entra no catálogo é métrica que
compila e devolve as colunas certas — mais garantia do que o POST /api/metrics
oferece hoje, que valida o documento mas não a consulta. A pergunta "quem
quebra se eu mexer aqui" passa a ter resposta em vez de suposição.

**Negativas.** SQL escrito por LLM passa a existir como artefato durável do
catálogo do cliente, reutilizável por outros relatórios. As travas mitigam o
alcance (somente leitura, sem tabela literal, escopo de tenant, teto de bytes)
mas não tornam a consulta *correta de negócio* — ela pode compilar, devolver as
colunas certas e ainda somar a coisa errada. Cabe a quem lê o relatório
conferir, e o assistente é instruído a dizer que o indicador é novo.

**Acúmulo.** A política de variante cria documento novo a cada ajuste de
métrica compartilhada. Preferível ao contrário (alteração silenciosa em página
alheia), mas o catálogo `chat.*` cresce e ainda não há tela para curá-lo.

**Custo.** Uma criação são dois round-trips a mais (list_metric_fields e o
dry-run). O dry-run não fatura byte.

## Alternativas consideradas

- **Colar entidades e atributos no prompt do supervisor.** Rejeitada: o
  contrato deste cliente tem 113 atributos, ~10% do prompt em TODO turno,
  inclusive nos que só respondem uma pergunta. Virou tool.
- **Editar a métrica e avisar quem usa depois.** Rejeitada: não há para quem
  avisar em tempo — o relatório alheio já teria mudado.
- **Validar só o texto (regex/parse) sem dry-run.** Rejeitada: `{contratos.saldo}`
  inexistente passa em qualquer validação textual, e o erro aparece no bloco
  vazio do usuário.
- **Deixar o modelo declarar `outputColumns`.** Rejeitada pelo mesmo motivo pelo
  qual `shape` foi criado (ADR-0022): declaração de memória diverge do SELECT.
  O dry-run já devolve os nomes reais.
- **Permitir recipe `aggregation`/`derived` gerada pela IA.** Fora de escopo:
  100% do catálogo em produção é `sql`, e `derived` tem lacunas conhecidas
  (ambiguidade de coluna no JOIN, registradas em `covenants-v2.mjs`).
