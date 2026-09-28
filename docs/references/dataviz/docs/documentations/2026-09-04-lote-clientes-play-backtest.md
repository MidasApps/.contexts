# Lote de clientes Play + Backtest — problemas e propostas

**Data:** 2026-09-04
**Escopo:** 7 clientes novos (SPL, Masa, BRZ, Construtora Sudoeste, Jotanunes, OM, MS)
sobre 2 produtos (`liquid-play`, `backtest`).
**Método:** introspecção de `INFORMATION_SCHEMA.COLUMNS` dos 9 datasets, cruzada
com o Data Contract gravado no Firestore. Nada foi inferido de nome de coluna.

> **BigQuery é somente leitura para este app.** Toda proposta que exige mudar
> tipo ou adicionar coluna é pedido para o time de dados, não tarefa que este
> repositório execute.

---

## 1. O que subiu

| Item | Antes | Depois |
|---|---|---|
| Produto `liquid-play` | **não existia** | criado, 24 métricas |
| Produto `backtest` | não existia | criado, 0 métricas |
| Contrato `liquid-play` / `contratos` | 96 atributos | 147 |
| Contrato `liquid-play` / `fluxo_caixa` | 17 | 26 |
| Contrato `liquid-play` / `pagamentos` | 13 | 20 |
| Contrato `backtest` | não existia | 98 + 14 atributos |
| Clientes | 4 | 11 |

Métricas que cada cliente novo consegue **executar de fato** — não "colunas do
contrato cobertas", mas métrica cujo `requires[]` inteiro resolve:

| Cliente | Monitor | Backtest |
|---|---|---|
| SPL | 24/24 | — |
| BRZ | 24/24 | sem métricas (§8) |
| Jotanunes | 24/24 | sem métricas (§8) |
| OM | 24/24 | — |
| Construtora Sudoeste | **20/24** (§6) | — |
| Masa | **16/24** (§5) | — |
| MS | **16/24** (§5) | — |

Onde a cobertura é parcial, o `enabledIndicators` do binding lista só as
métricas que rodam. Isso não é cosmético: `enabledIndicators` é o que o agente
de IA lê como oferta do cliente, e deixá-lo `null` faria a IA propor um bloco
que morre no `resolveColumn` — o que se lê na tela como bug do produto, não
como lacuna de dado.

---

## 2. 🔴 `brz_backtest.contratos` está inteiramente em STRING

**O problema.** 81 de 81 colunas são `STRING`. Inclusive `saldo_devedor`,
`valor_atraso`, `valor_imovel`, `vpl`, `dias_atraso`, `data_base_report` e
`data_emissao`.

Para comparação, `jotanunes_backtest.contratos` tem 49 das 83 tipadas. O mesmo
produto, o mesmo vocabulário, dois níveis de tipagem.

**Por que bloqueia.** Toda métrica de valor faz `SUM`, `AVG` ou comparação de
data. Sobre `STRING` o BigQuery ou recusa a query ou — pior — ordena
lexicograficamente: `"1000" < "9"`. E `data_base_report` como texto quebra o
filtro de período, que é a espinha de todo bloco do produto.

**O que foi feito.** O contrato `backtest` declara o **tipo semântico** (o do
Jotanunes): `saldo_devedor` é `FLOAT64`. Preferi isso a declarar `STRING`
porque o contrato descreve o que o dado *é*; declarar `STRING` transformaria um
defeito de carga em decisão de arquitetura, e amanhã haveria uma métrica escrita
para texto.

Consequência honesta: **para BRZ, contrato e dado divergem hoje.** Nenhuma
métrica de backtest existe (§8), então nada quebra agora — mas a primeira que
existir vai falhar em BRZ e funcionar em Jotanunes.

**Proposta (recomendada).** Pedir ao time de dados a retipagem de
`brz_backtest.contratos` no padrão de `jotanunes_backtest`. É `CREATE OR REPLACE
TABLE ... AS SELECT SAFE_CAST(...)`, uma vez, e o dataset já tem histórico de
`contratos_backup_pre_fix` no `brz_monitor` — o time já fez esse movimento antes.

**Alternativa, se a retipagem não vier.** `tableBindings` aceita apontar a
entidade para outra tabela física: cria-se uma view `contratos_typed` no
dataset e o binding do cliente passa a apontar para ela. Custo: uma view por
cliente afetado, e a divergência sai do contrato mas entra na infra.

**Alternativa que eu não recomendo.** Fazer a métrica dar `SAFE_CAST` no
template. Espalha o defeito por 20 receitas em vez de consertar 1 tabela, e a
receita passa a mentir sobre o tipo do contrato.

---

## 3. 🟡 `jotanunes_backtest` parcialmente em STRING

34 de 83 colunas de `contratos` e 12 de 14 de `pagamentos` estão em `STRING`.
São majoritariamente indicadores de bureau (`bvs_*`, `serasa_*`), onde texto
pode ser legítimo — vários são código de classe, não número.

**O que não sei, e não inventei:** `bvs_eos_2026`, `serasa_score_hcr3`,
`serasa_xvlrestrati` e outros 13 existem **apenas no BRZ**, que está 100% em
`STRING`. Para esses, `STRING` é o único tipo observável — não evidência de que
sejam texto. Estão marcados com `tipoNaoVerificado: true` em
`scripts/onboarding-lote-2026-09/atributos-backtest.mjs`.

**Proposta.** Junto com a retipagem do §2, confirmar com quem originou os
campos quais `bvs_*`/`serasa_*` são numéricos. Enquanto isso o contrato declara
`STRING`, que é o comportamento seguro: nenhuma métrica vai somar por acidente.

---

## 4. 🟡 `data_entrega`: `DATE` em SPL e BRZ, `TIMESTAMP` em OM

**Decisão tomada:** o contrato declara `DATE`. Dois dos três clientes usam
`DATE`, e data de entrega de unidade é um dia, não um instante — a hora não
carrega informação.

**Efeito em OM:** comparações continuam funcionando (o BigQuery converte
`TIMESTAMP` para `DATE` em contexto de comparação), mas um `GROUP BY` direto
agrupa por instante e produz um grupo por registro.

**Proposta.** Pedir `DATE` em `om_monitor.contratos.data_entrega`. Sem isso,
qualquer métrica futura que agrupe por data de entrega precisa de `DATE()`
explícito, e nenhuma métrica atual usa o campo — então o custo de esperar é zero
e o de esquecer é uma série silenciosamente errada.

---

## 5. 🔴 Masa e MS não têm `status_contrato`, `categoria_venda` nem `tipo_recebivel`

**Medido:** 16 das 24 métricas do Play não rodam nesses dois clientes.

| Atributo exigido | Falta em | Métricas bloqueadas |
|---|---|---|
| `contratos.status_contrato` | Masa, MS | `contratos_ativos`, `contratos_distratados`, `contratos_quitados`, `emp_saldo_devedor`, `emp_unidades_vendidas`, `mapa_vendas_table` |
| `contratos.categoria_venda` | Masa, MS | `mapa_vendas_table` |
| `fluxo_caixa.tipo_recebivel` | Masa, MS, Sudoeste | `mapa_vendas_table`, `recebiveis_por_inadimplencia`, `recebiveis_pre_pos_snapshot` |

**O que verifiquei antes de chamar de ausente.** Procurei sinônimo entre as
colunas que esses clientes têm e o contrato não conhece. Masa tem `tipo_contrato`
e `juridico`; MS tem `tipo_contrato`. **Não mapeei nenhum dos dois para
`status_contrato`**, porque tipo e situação são conceitos distintos, e binding
errado devolve número confiantemente errado — pior que bloco vazio, porque
ninguém desconfia.

`Elegibilidade` (maiúscula) nesses dois clientes **é** o `elegibilidade` do
contrato, só com outra caixa. Esse eu mapeei — ver §11.

**Proposta (precisa da sua resposta).** Três caminhos, em ordem de preferência:

1. **Pedir as colunas ao time de dados.** `status_contrato` e `categoria_venda`
   existem em 5 dos 7 clientes do lote; é o padrão do produto, e Masa/MS são a
   exceção. Recomendo este.
2. **Confirmar que `tipo_contrato` é o `status_contrato` deles.** Se for, é uma
   linha em `SINONIMOS` (`scripts/onboarding-lote-2026-09/clientes.mjs`) e as 6
   métricas voltam. **Só faço com sua confirmação** — não tenho como verificar
   pelo schema.
3. **Aceitar 16/24.** Já é o estado gravado; nada mais a fazer.

`tipo_recebivel` (pré/pós-chaves) parece dado que esses clientes simplesmente
não segregam. Se for isso, as 3 métricas de recebível não se aplicam a eles e o
caminho 3 é o certo para esse campo específico.

---

## 6. 🟡 `construtora_sudoeste.fluxo_caixa` está num grão diferente

As 15 colunas do `fluxo_caixa` do Sudoeste **não incluem `id_contrato`** — mas
incluem `projeto`, `empresa`, `status_contrato`, `categoria_venda`,
`building_status`, `estado`, `cidade`. É fluxo **agregado por
projeto/característica**, não por contrato.

Todos os outros 6 clientes do lote têm `id_contrato` nessa tabela.

**Efeito:** 20/24 métricas. Quebram `fluxo_por_faixa_serie`,
`mapa_vendas_table`, `recebiveis_por_inadimplencia` e
`recebiveis_pre_pos_snapshot` — as que juntam fluxo com contrato.

**Proposta.** Isto não é campo faltando, é **modelo de dados diferente**, e
merece decisão explícita:

- **Se o fluxo do Sudoeste deve ser por contrato:** pedir `id_contrato` na
  origem. Volta a 24/24 sem mexer em código.
- **Se o fluxo dele é agregado por natureza:** as 4 métricas não se aplicam, e
  o correto é uma variante agregada delas (métrica nova, sem o join). Isso é
  trabalho de indicador novo, não de binding — me diga e eu escrevo.

Também faltam `data_emissao` e `tipo_recebivel` no `fluxo_caixa` dele, coerente
com o grão agregado.

---

## 7. 🟡 `construtora_sudoeste`: `taxa_pricing` e `private_area` em STRING

O contrato declara `FLOAT64` (é o tipo em todos os outros clientes); o Sudoeste
entrega `STRING`. Duas colunas, isoladas — não é o caso sistêmico do §2.

Nenhuma métrica atual usa as duas, então não quebra nada hoje.

**Proposta.** Retipar na origem para `FLOAT64`. É o mesmo pedido do §2, muito
menor, e pode ir no mesmo ticket.

---

## 8. 🔴 O produto Backtest subiu sem nenhum indicador

O produto e o contrato existem; `metricRefs` está vazio. Não há uma única
métrica no catálogo que leia o contrato `backtest`.

**Por que não criei.** Duas razões, e a segunda é a que pesa:

1. Métrica de backtest precisa de decisão de negócio que eu não tenho: qual é a
   pergunta que um backtest responde? Comparação entre `perfil_backtest`?
   Curva de inadimplência por `timeline`? Poder discriminante dos scores de
   bureau contra a inadimplência observada? Cada uma é um bloco diferente.
2. Enquanto o §2 não for resolvido, **qualquer métrica numérica que eu escrevesse
   funcionaria em Jotanunes e falharia em BRZ.** Entregar indicador que roda em
   metade dos clientes do produto é entregar um defeito com aparência de feature.

**Proposta.** Depois da retipagem, me diga as 3–5 perguntas que o Backtest
precisa responder e eu escrevo as métricas. Se quiser um ponto de partida
enquanto isso, as 21 colunas que o backtest compartilha com o Monitor permitem
reaproveitar a lógica de `inadimplencia_pct` e `over90_pct` com um recorte
adicional por `perfil_backtest` — são as duas de menor risco.

---

## 9. 🟡 "One Shot" foi pedido mas não veio dataset

O pedido abria com "clientes do Play, One Shot e Backtest", e a lista tem
`(Play)`, `(Monitor)` e `(Backtest)` — nenhuma linha `(One Shot)`, e nenhum
dataset `*_oneshot` entre os 25 informados.

Tratei `(Play)` e `(Monitor)` como o mesmo produto, porque SPL está rotulado
`(Play)` e usa `spl_monitor`, com a mesma forma dos rotulados `(Monitor)`. O
produto é o Liquid Play; `_monitor` é o sufixo do dataset dele.

`One Shot` **não foi criado**: criar produto vazio, sem contrato e sem cliente,
seria cadastro que só gera lacuna na tela. A ADR
`multi-product-dataset-integration` cita `morar_oneshot` como exemplo do
domínio, então o produto é real — só não está neste lote.

**Proposta.** Me passe os datasets de One Shot e eu subo pelo mesmo caminho.

---

## 10. 🟡 O contrato `liquid-play` tem 126 atributos sem descrição

Achado colateral: os 126 atributos que já existiam têm `description: ""` e
`label` igual ao nome da coluna (`label: "saldo_devedor"`). Foram semeados
mecanicamente.

**Por que importa.** A descrição do atributo alimenta o contexto semântico do
agente de IA (`client-semantic-context.ts`). Com descrição vazia, o agente vê
`faixa_atraso_1` e `faixa_atraso_2` sem saber qual régua cada uma usa — e
escolhe por adivinhação.

Os 67 atributos novos deste lote têm label e descrição em PT-BR. O contrato
está, portanto, **metade documentado**.

**Proposta.** Backfill dos 126 antigos. É mecânico e de baixo risco (só escreve
`label` e `description`, não toca em `type`), mas são 126 textos de domínio e
preferi não misturar com o onboarding. Digo em uma linha quando quiser.

---

## 11. ✅ Resolvidos no próprio lote

**`Elegibilidade` com caixa divergente.** Masa e MS trazem `Elegibilidade`;
o contrato tem `elegibilidade`. É o mesmo conceito. Virou entrada em
`SINONIMOS`, não atributo novo — dois nomes para um conceito é exatamente o que
a camada de binding existe para evitar.

**Caixa dos identificadores no Backtest.** Os dois datasets trazem `Cidade`,
`Estado`, `Regional` e `Status_contrato` com inicial maiúscula. O atributo foi
declarado em minúscula (o vocabulário é um só) e a caixa real entrou no
`schemaBindings` via `CAIXA_REAL`.

**`ltv_dirty` com tipo inválido.** O contrato tinha `type: "FLOAT"`, que **não
existe** no enum `FieldType` de `src/shared/schemas/product.ts` (o válido é
`FLOAT64`). Corrigido. Passava desapercebido porque nada revalida o contrato
gravado contra o Zod.

**`brz_backtest` sem tabela `pagamentos`.** O contrato `backtest` declara a
entidade (Jotanunes tem), e o binding do BRZ simplesmente não a mapeia. Tabela
ausente é fato diferente de coluna ausente, e a codificação reflete isso.

---

## 12. ⚠️ Efeito colateral de criar o produto `liquid-play`

O produto **não existia** no Firestore, mas 3 clientes já em produção
(`cedro-rosa`, `galli-vivapark`, `vita-urbana`) apontam para
`productId: "liquid-play"` — referência pendurada, com binding completo
(126–153 `schemaBindings`) e nenhum produto do outro lado.

Como `useAvailableProducts` filtra os produtos pelos bindings do cliente, esses
3 clientes **passam a ver 2 produtos no seletor em vez de 1**. Os dados do
binding deles estão completos, então o produto funciona — mas é mudança visível
que eu não fui pedido para fazer, e não havia como criar os 7 clientes novos sem
ela: todos assinam `liquid-play`.

Anomalia relacionada, **pré-existente e não tocada**: `vila-rosa` tem o dataset
`vila_rosa_monitor` (contrato `liquid-play`) aninhado dentro do binding de
`liquid-play-plus`, em vez de num binding próprio de `liquid-play`. Agora que o
produto existe, dá para corrigir — mas mexer em cliente em produção fora do
escopo do lote é decisão sua.

---

## Resumo dos pedidos ao time de dados

| # | Dataset | Pedido | Prioridade |
|---|---|---|---|
| 2 | `brz_backtest.contratos` | retipar as 81 colunas no padrão `jotanunes_backtest` | alta |
| 5 | `masa_monitor`, `ms_monitor` | adicionar `status_contrato` e `categoria_venda` em `contratos` | alta |
| 6 | `construtora_sudoeste_monitor.fluxo_caixa` | adicionar `id_contrato` (ou confirmar grão agregado) | alta |
| 7 | `construtora_sudoeste_monitor.contratos` | retipar `taxa_pricing` e `private_area` para `FLOAT64` | média |
| 4 | `om_monitor.contratos` | `data_entrega` de `TIMESTAMP` para `DATE` | baixa |
| 3 | `*_backtest` | confirmar quais `bvs_*`/`serasa_*` são numéricos | baixa |

## Perguntas que dependem de você

1. **§5** — `tipo_contrato` em Masa/MS é o `status_contrato` deles? (1 linha de
   binding devolve 6 métricas por cliente)
2. **§6** — o fluxo de caixa do Sudoeste é agregado por natureza, ou falta
   `id_contrato`?
3. **§8** — quais perguntas o Backtest precisa responder?
4. **§9** — onde estão os datasets de One Shot?
5. **§10** — faço o backfill das 126 descrições?
6. **§12** — corrijo o binding do `vila-rosa`?

## Reprodução

```bash
# 1. Introspecção (somente leitura do INFORMATION_SCHEMA)
BIGQUERY_CREDENTIALS=~/.gcloud/liquid-play-dataviz-sa.json \
  node scripts/onboarding-lote-2026-09/introspecta.mjs schemas.json

# 2. Seed — verifica os dicionários contra o schema real e aborta em divergência
GOOGLE_APPLICATION_CREDENTIALS=~/.gcloud/liquid-play-app-sa.json \
  node scripts/onboarding-lote-2026-09/seed.mjs --schemas schemas.json --dry-run
```

O seed é idempotente, e trata texto e tipo com pesos diferentes de propósito:

- `label`, `description` e `unit` são **sempre realinhados ao dicionário**.
  Descrição errada não é enfeite — é o que alimenta o contexto semântico do
  agente de IA, então precisa ser corrigível. (Foi assim que se consertou uma
  descrição minha que afirmava a caixa errada da coluna de origem em
  `backtest/pagamentos.regional`.)
- `type`, `isKey` e `required` são **gravados só na criação**. Mudança de tipo
  em contrato vigente passa pela lista `CORRECOES_DE_TIPO`, que é revisável em
  code review.

A lista `DIVERGENCIAS_CONHECIDAS` dentro do seed é a fronteira entre
"divergência documentada aqui" e "surpresa nova" — divergência de tipo fora da
lista aborta a execução **antes** de gravar qualquer coisa.

Guarda de código em `scripts/onboarding-lote-2026-09/__tests__/dicionarios.test.ts`
(22 testes): o seed verifica os dicionários contra o BigQuery, o teste os
verifica contra os schemas Zod. Um olha o dado, o outro olha o tipo — é a
segunda checagem que teria pegado o `ltv_dirty: "FLOAT"` do §11.
