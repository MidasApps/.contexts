---
title: Camada semântica
category: contracts
version: 1.0
last_updated: 2026-08-04
status: active
related: [ADR-0015, ADR-0016, ADR-0017, rules/tenancy, rules/cost]
---

# Camada semântica — `metric` → `dataContract` → `binding`

> **Por que este documento existe.** Um grep por `semantic layer|recipe|
> dataContract|productBinding` em todo o `.contexts/` retornava **zero**. A
> camada que traduz "PDD" em SQL executado no dataset de um cliente — o coração
> do produto — não tinha uma linha de convenção. As decisões viviam em
> comentários de implementação.

## O caminho

```
metric.recipe  →  dataContract (entidades + atributos)  →  client.productBindings  →  dataset BigQuery
```

- **Metric** (`metrics/{id}`) é o vocabulário. Id no formato `domain.slug`.
  Declara o que precisa em `requires[]` e como calcular em `recipe`.
- **Data Contract** é o vocabulário canônico: entidades e atributos com nomes
  estáveis, independentes de como cada cliente nomeou suas colunas.
- **Binding** (`client.productBindings`) mapeia atributo canônico → coluna real
  daquele cliente. É o único lugar onde nome de coluna de cliente aparece.

A mesma métrica serve vários clientes porque nenhuma parte dela conhece nomes de
coluna. Quebrar isso — colocar nome de coluna de cliente numa métrica — é a
falha estrutural desta camada.

## A distinção que mais importa: fail-loud vs soft

Nem toda referência não resolvida é igual, e tratá-las igual quebra o produto de
um jeito ou de outro. **Esta distinção era a única regra crítica que existia
apenas em comentário.**

| Tipo de ref | Não resolve ⇒ | Por quê |
|---|---|---|
| **Coluna de dado** (`resolveColumn` no caminho de execução) | **Falha alto.** `MetricResolutionError` / `FieldUnavailableError`. | O número sairia errado em silêncio. Num produto de risco de crédito, número errado com cara de certo é pior que erro. |
| **Ref de catálogo** (`metricRefs`, `productRefs`, `requires` na validação de cadastro) | **Warning, persiste mesmo assim.** | São refs de configuração; a UI degrada mostrando o que existe. Bloquear o cadastro por ref órfã impediria a montagem incremental do catálogo. |

Regra: **se o valor entra numa conta, falha alto; se governa exibição de
catálogo, avisa.** Na dúvida, falha alto.

## Regras

- **Nome de coluna de cliente só existe no binding.** Nunca em `metric.recipe`,
  nunca em código de página, nunca em prompt.

- **Valor vai em parâmetro; identificador vai por helper.** BigQuery **não**
  parametriza identificadores. Valores usam parâmetros nomeados (`@nome`);
  tabela e coluna passam obrigatoriamente por
  `src/shared/lib/bigquery/identifier.ts`. Interpolar identificador à mão é
  injeção, mesmo vindo do binding.

- **Campo ausente ≠ campo indisponível.** No schema de binding, ausente cai no
  nome canônico (retrocompatibilidade) e **conta como disponível**; `null`
  significa explicitamente indisponível e reprova. Quem escreve uma verificação
  de cobertura precisa saber qual dos dois está medindo.

- **Recipe gerada por modelo é validada antes de persistir.** Todo caminho que
  grava `metrics/{id}` passa por `MetricDoc` — inclusive os que escrevem
  server-side sem cruzar a rota HTTP. Doc inválido no catálogo só falha depois,
  na execução, longe da causa.

- **Execução de métrica respeita os três eixos de tenancy.** Ver
  `@rules/tenancy`. O enforcement de rota por métrica é uma allowlist: métrica
  fora dela mantém o gate de tenant e perde o de rota — comportamento aceito e
  registrado (achado R5), não acidente.

- **Todo SQL executado tem teto de bytes.** Ver `@rules/cost`.

## Checklist

- [ ] Métrica nova não cita nenhum nome de coluna de cliente.
- [ ] Todo valor dinâmico é parâmetro nomeado; todo identificador passou por helper.
- [ ] A ref nova está do lado certo da tabela fail-loud/soft — e o código reflete isso.
- [ ] Escrita em `metrics/{id}` passa por `MetricDoc`.
- [ ] Recipe nova tem teto de bytes no caminho de execução.

## Anti-patterns

- `SELECT saldo_devedor` numa recipe: prende a métrica a um cliente.
- Fallback silencioso para `0` quando o binding não resolve — foi substituído
  por `FieldUnavailableError` justamente porque escondia dado faltando atrás de
  um número plausível.
- Duplicar a resolução de coluna num caminho novo em vez de usar
  `resolveMetric`.

## Estado da ADR

A **ADR-0015**, que define este desenho, está `Proposed` e governa código em
produção desde 2026-05-11. Isso é dívida de processo, não de código: o desenho
está implementado e esta convenção o descreve. Ao citá-la, cite o `status:` real.
