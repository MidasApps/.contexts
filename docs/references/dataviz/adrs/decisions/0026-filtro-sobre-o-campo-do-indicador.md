---
id: 0026
title: Filtro de página se declara sobre o campo do indicador, não sobre a coluna da entidade
status: Accepted
date: 2026-08-18
deciders: [giulliano.soares]
consulted: [time-ai]
informed: [time-eng, time-produto]
tags: [filtros, semantica, metricas, ai, arquitetura]
related: [0015, 0023, 0024, 0025]
---

# ADR-0026 — Filtro de página se declara sobre o campo do indicador

## Status

Accepted — 2026-08-18.

Histórico:
- 2026-08-18 — proposta e aceita pelo dono do produto na mesma sessão em que o
  defeito foi diagnosticado.
- 2026-08-19 — **errata de fato, não de decisão** (revisão de código). Duas
  afirmações sobre a validação de `expr` não descreviam o código, e já não
  descreviam quando foram escritas. As decisões seguem em vigor; as correções
  estão marcadas em linha, na Decisão §1 e nas Consequências → Neutras.

## Contexto

A ADR-0025 fez o filtro de página nascer a pedido, criado pelo assistente. O
primeiro uso real com um usuário expôs um defeito que não é do modelo: é do
vocabulário que a ferramenta oferece a ele.

Pedido: *"o filtro eu quero pelo nome do banco e não pelo número dele"*. Entrega:
um seletor com uma única opção, `77`.

### O que a medição mostrou

A página **Extrato Detalhado** exibe a coluna `Banco` com o valor `BANCO INTER`.
Esse texto não é coluna de `transacoes` — ele nasce de um JOIN que a própria
métrica faz:

```sql
-- covenants.extrato_table
SELECT …, b.nome_reduzido AS banco, …
FROM {transacoes} t
LEFT JOIN `bq-data-wh.liquid_aux.ba_bancos` b ON t.{transacoes.banco_codigo} = b.numero_codigo
```

O `add_page_filter`, porém, só aceita `entidade.atributo` — vocabulário do
contrato de dados. Dentro desse vocabulário o nome do banco **não existe**. O
modelo escolheu o menos ruim que encontrou na lista de atributos,
`transacoes.pagador_banco`, que é `NULL` em 418 de 418 linhas. A rota
`/api/metrics/filter-values` trata `labelAttribute` como best-effort e descarta
rótulo nulo em silêncio, então o dropdown caiu para o valor cru e ninguém errou
em voz alta:

```
SELECT DISTINCT `banco_codigo` AS value, `pagador_banco` AS label FROM … transacoes
→ [{"value":77,"label":null}]   → opções renderizadas: ["77"]
```

Não é um caso de banco. O mesmo filtro de **Categoria**, criado no turno
seguinte e anunciado como "já está filtrando os dados da tabela", ofereceria:

| Dropdown (coluna crua da entidade) | Tabela (o que o usuário vê) |
|---|---|
| Eating out, Electricity, Groceries, Housing, Purchasing, Revenue, Same person transfer, Services, Shopping, Tax on financial operations, Taxi and ride-hailing, Transfers — **12, em inglês** | Compras, Entrada, Impostos, Transferência mesma titularidade — **4** |

### Onde o sistema trava

Dois limites, ambos em código nosso:

1. `resolve-metric.ts:409` — `{filter.X:ref}` só aceita `entidade.atributo` e
   resolve via `schemaBindings`. Não tem como apontar para `b.nome_reduzido`,
   que é coluna de tabela auxiliar trazida no JOIN.
2. `app/api/metrics/filter-values/route.ts` — monta
   `SELECT DISTINCT <coluna> FROM <tabela da entidade>`. Nunca enxerga o JOIN.

E `ba_bancos` não pode virar Relation da camada semântica: ela vive em
`liquid_aux`, fora de qualquer Data Contract, e `RelationDoc.leftRef/rightRef`
exigem `contractId.entityId.attributeId` — a restrição já estava registrada em
`scripts/seed-covenants-v2-relations.mjs`.

### Raio de alcance

Medido no catálogo em produção: das 66 métricas, **4** citam filtro não-temporal,
todas `covenants.*` sobre `transacoes` — `extrato_table`, `saidas_por_categoria`,
`entradas_por_categoria`, `transacoes_por_tipo_serie` — com três chaves ao todo
(`banco`, `categoria`, `tipo`).

## Decisão

**Adotamos o campo do indicador como unidade do filtro de página.** O usuário
filtra pelo que está na tela; a métrica declara o que aquele campo compara.

### 1. A métrica declara seus campos filtráveis

`MetricDoc` ganha `filterFields` — mapa da chave de filtro para como ESTA métrica
a atende:

```ts
filterFields?: Record<FilterKey, {
  /** Expressão SQL que esta métrica compara no WHERE. Ex.: 'b.nome_reduzido'. */
  expr: string;
  /** Coluna do resultado que MOSTRA esse mesmo valor, quando a métrica a exibe. */
  field?: string;
  /** Rótulo sugerido para o seletor. Ex.: 'Banco'. */
  label?: string;
}>
```

`expr` aceita os mesmos placeholders do template (`{entidade.atributo}`) e é
substituída pelo mesmo passo do resolver, então uma métrica pode declarar
`t.{transacoes.tipo}` sem saber o nome físico da coluna. Seu nível de confiança
é o do `recipe.template`: mesmo documento, mesmo autor, mesmo dry-run.

> **Errata — 2026-08-19.** "Mesmo dry-run" é falso, e era falso ao ser escrito.
> `valida-rascunho.ts:103` (`FILTROS_DE_VALIDACAO`) injeta só os filtros de
> tempo — `date_range`, `snapshot`, `ate`. Qualquer outro `{filter.X}` cai no
> `if (!pf) return '1=1'` do resolver, então a `expr` não é renderizada nem
> compilada. E o rascunho validado é montado campo a campo, sem `filterFields`:
> não há o que validar. A `expr` só chega ao BigQuery quando alguém escolhe um
> valor no dropdown — alias errado falha ali, na tela do usuário.
>
> A guarda que de fato existe antes do SQL é o `refine` de `FilterField` em
> `src/shared/schemas/metric.ts` (sem `;`, sem `--`/`#`/comentário de bloco),
> documentada lá. A DECISÃO — `expr` como SQL cru vindo do documento — não muda;
> o que estava errado é o risco que esta ADR afirmou ter aceitado.

`field` é o que liga o filtro ao que se vê. Ele é **opcional de propósito**:
`transacoes_por_tipo_serie` filtra por banco e não exibe banco nenhum. Uma
métrica que declara `field` pode alimentar o seletor; uma que declara só `expr`
apenas obedece.

### 2. O resolver compara a expressão declarada

`{filter.X}` passa a resolver por precedência explícita:

1. `{filter.X:entidade.atributo}` — pin no template vence (é como os filtros de
   tempo funcionam, e nada disso muda);
2. `metric.filterFields[X].expr` — a expressão declarada, renderizada e
   comparada verbatim;
3. `pageFilter.attribute` — o caminho de hoje, para filtro gravado antes desta ADR;
4. nada disso → `1=1`, como sempre.

### 3. O seletor lê os valores do próprio indicador

`/api/metrics/filter-values` ganha um segundo modo, por métrica e campo:

```sql
SELECT DISTINCT <field> AS value
FROM (<sql resolvido da métrica>)
WHERE <field> IS NOT NULL ORDER BY 1 LIMIT 200
```

As opções passam a ser, **por construção**, o mesmo texto da tela. Não existe
mais rótulo que possa divergir do valor, porque não existe mais rótulo: o valor
É o texto exibido. O modo antigo (`attribute`) continua atendendo o que já está
gravado.

### 4. A página guarda de onde o seletor lê

`metricPageFilters[key]` ganha `source: { metricId, field }` para filtros
`kind: 'in'` com `control: 'dropdown'`. `attribute` deixa de ser obrigatório
nesses — quem decide a comparação é a métrica, não a página.

### 5. A ferramenta se aterra nos indicadores da página

`add_page_filter` deixa de receber `attribute` (vocabulário do contrato inteiro,
com mais de cem atributos que não aparecem em indicador nenhum) e passa a receber
`campo` — um campo filtrável declarado pelas métricas **daquela página**. Nasce
`list_page_fields`, que lista os indicadores da página e seus campos filtráveis;
e a recusa do `add_page_filter` traz a mesma lista, para o modelo se corrigir no
mesmo turno.

### 6. Colisão de chave recusa, não renomeia

`chaveDeFiltro` renomeava em silêncio: com `banco` já declarada, "Banco" virava
`banco_2` — e como nenhuma métrica cita `{filter.banco_2}`, o seletor nascia
decorativo. Foi o que aconteceu no primeiro turno do caso real. Passa a recusar,
dizendo qual chave já existe.

### 7. As quatro métricas passam a comparar o que exibem

Migração do catálogo (`scripts/patch-covenants-filter-fields.mjs`): os pins
`{filter.banco:transacoes.banco_codigo}` e `{filter.categoria:transacoes.categoria}`
saem, entram `{filter.banco}` / `{filter.categoria}` e as declarações de
`filterFields`. As métricas que ainda não juntavam `ba_bancos` ou
`ba_pluggy_categorias` passam a juntar — **é o preço de o filtro valer para a
página inteira**: se a tabela comparasse nome e o gráfico ao lado comparasse
código, escolher "BANCO INTER" zeraria o gráfico. O domínio de uma chave é um só,
e todas as métricas da página comparam o mesmo.

## Consequências

### Positivas
- O seletor não tem como divergir da tela: as opções saem do resultado do
  indicador, não de uma coluna paralela.
- Some a classe inteira de bug "valor cru no filtro, valor traduzido na tabela" —
  que atingia `categoria` tanto quanto `banco`.
- Escolher "Impostos" passa a recortar os 12 valores crus da Pluggy que se
  agrupam nele. Com comparação por coluna crua isso exigiria mandar os 12
  valores; comparando a expressão exibida, é uma coisa só.
- O assistente escolhe entre os campos **daquela página** — lista curta e
  visível — em vez de garimpar no contrato do cliente inteiro.

### Negativas / Trade-offs
- **Métrica que não declarar `filterFields` fica fora do alcance do filtro.** É o
  mesmo `blocosQueReagem / blocosQueIgnoram` da ADR-0025, agora sobre campo
  visível — mas o custo de entrada de uma métrica nova subiu: quem quiser que ela
  seja filtrável precisa declarar.
- **A comparação passa a ser sobre texto** (`nome_reduzido`), não sobre código.
  Dentro de uma mesma consulta os dois são 1:1 pelo JOIN, então não há
  ambiguidade; mas renomear um banco na tabela auxiliar invalida uma seleção
  salva. Reavaliar se algum dia houver filtro persistido entre sessões.
- **Três métricas ganham JOINs que não precisavam** para o próprio cálculo, só
  para o filtro poder valer nelas. São lookups pequenas (`ba_bancos`,
  `ba_pluggy_categorias`), mas é custo de query que existe mesmo quando ninguém
  filtra.
- **As opções do seletor não respeitam o período escolhido** — a métrica é
  resolvida sem filtro de página, então lista o domínio inteiro. É o mesmo
  comportamento (e o mesmo custo de varredura) de hoje. Reavaliar quando alguma
  entidade grande ganhar seletor.

### Neutras
- `expr` é SQL cru vindo de documento. Não é superfície nova: `recipe.template`
  já é. Vale a mesma regra — escrito por seed/admin, ou pelo assistente via
  `update_metric`, que faz dry-run antes de gravar.

  > **Errata — 2026-08-19.** A segunda metade nunca foi verdade. Nenhuma tool
  > grava `filterFields`: `gravaMetricaDoChat` monta o documento a partir de uma
  > lista fixa de campos que não o inclui, e `update_metric` escreve por ali. O
  > único escritor hoje é `scripts/patch-covenants-filter-fields.mjs`. Logo o
  > campo não passa por dry-run de tool nenhuma — nem poderia, pela errata acima.
  >
  > Enquanto isso ficou implícito, houve dano: aquela função persiste com
  > `ref.set()`, sobrescrita inteira, então corrigir no chat uma métrica que TEM
  > `filterFields` apagava a declaração e o seletor da página parava de recortar
  > o bloco em silêncio. Corrigido em 2026-08-19 por `preservadoDoAnterior()` em
  > `src/shared/lib/metrics/metrica-do-chat.ts`. A variante continua nascendo sem
  > `filterFields` — e deve mesmo: seu SQL é outro, e herdar uma `expr` que cita
  > alias que a nova consulta não tem seria pior que não herdar nada.
- Migração é aditiva (`expand`): schema novo é opcional, o modo antigo da rota
  continua, e filtro já gravado com `attribute` segue funcionando. O que **não**
  é aditivo é trocar os pins das 4 métricas: filtro `banco` já gravado numa
  página aponta para código e a métrica passa a comparar nome. Os relatórios
  afetados são regravados no mesmo script.

## Alternativas consideradas

### A — Lookup declarado no atributo do contrato
O atributo `transacoes.banco_codigo` declararia de onde vem seu nome
(`ba_bancos` / `numero_codigo` / `nome_reduzido`); o dropdown mostraria o nome e
mandaria o código.
**Pros**: declarado uma vez, vale para todo cliente e toda métrica; comparação
continua sobre código, estável a renomeação.
**Cons**: duplica na camada semântica uma tradução que a métrica já faz no JOIN;
exige que o dropdown mande N valores crus quando N deles se agrupam num rótulo
(os 12 da Pluggy viram 4 na tela); e `ba_bancos` está fora de qualquer contrato,
então a camada semântica passaria a apontar para tabela que ela não modela.
**Por que rejeitada**: resolve na entidade um problema que o indicador já
resolveu. Foi a primeira proposta desta investigação e o dono do produto a
recusou com a pergunta certa — *"o extrato detalhado tem Banco e o valor tem o
nome, é esse campo que eu queria usar no filtro"*.

### B — Filtrar por cima da saída do indicador
`SELECT * FROM (<sql da métrica>) WHERE banco IN (…)` — sem declarar nada.
**Pros**: leitura mais literal de "filtrar pelo que está na tela"; custo zero de
declaração.
**Cons**: só é correta para bloco de linhas. Num KPI a agregação já aconteceu
dentro do subselect, e recortar depois dá número errado; pior, um KPI que não
exibe `banco` não teria nem a coluna para recortar.
**Por que rejeitada**: o filtro precisa valer para os indicadores da página,
sempre — e essa alternativa vale só para alguns.

### C — Deixar como está e só recusar com honestidade
A ferramenta sondaria o campo antes de gravar e recusaria quando não conseguisse
mostrar o mesmo texto da tela.
**Pros**: barata, sem decisão de arquitetura; acaba com o anúncio falso.
**Cons**: não entrega o que foi pedido. O filtro de banco continuaria por número
e o de categoria em inglês.
**Por que rejeitada**: honestidade sobre a limitação é requisito, não solução —
e entra nesta ADR de qualquer forma (itens 5 e 6).

## Implementação

- **Schema**: `src/shared/schemas/metric.ts` (`filterFields`),
  `src/shared/config/agents/types.ts` (`metricPageFilters[].source`).
- **Resolver**: `src/shared/lib/metrics/resolve-metric.ts` — precedência de
  `{filter.X}`.
- **Rota**: `app/api/metrics/filter-values/route.ts` + `schema.ts` — modo
  `metricId`/`field`.
- **Cliente**: `src/shared/lib/metrics/fetch-filter-values.ts`,
  `src/widgets/page-filter-bar/ui/PageFilterBar.tsx`,
  `src/shared/hooks/useReportData.ts`.
- **Ferramentas**: `src/features/ai-agents/tools/page-filters/` — `list-page-fields`
  (nova), `add-page-filter` (passa a receber `campo`) e `filtro-de-pagina`
  (`camposFiltraveisDaPagina`, `metricasQueHonram`) —, registradas em
  `src/features/ai-agents/mastra/authoring-tools.ts`.
- **Contexto do assistente**: `src/shared/repositories/client-semantic-context.ts`
  precisa carregar `filterFields`; sem isso a lista de campos chega vazia.
- **Rotas de dados**: `/api/metrics/batch` e `/api/metrics/[id]/data` aceitam
  filtro `in` sem `attribute` — exigi-lo rejeitava o lote inteiro com 400.
- **Migração do catálogo**: `scripts/patch-covenants-filter-fields.mjs` — as 4
  métricas e os relatórios que já declaram `banco`/`categoria`.

## Referências

- ADR-0025 — filtro só quando pedido (o que esta ADR corrige no vocabulário).
- ADR-0015 — camada semântica: por que `ba_bancos` não é entidade.
- `scripts/seed-covenants-v2-relations.mjs` — registro de que o JOIN
  `transacoes × ba_bancos` não pode ser Relation.
