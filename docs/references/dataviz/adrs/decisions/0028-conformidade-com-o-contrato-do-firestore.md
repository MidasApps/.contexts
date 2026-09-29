---
id: 0028
title: O código se conforma ao contrato do Firestore — migração em quatro fases, sem big-bang
status: Proposed
date: 2026-09-24
deciders: [andrelmm]
consulted: [time-eng]
informed: [time-ai, time-produto]
tags: [firestore, data-model, naming, migracao, governanca, contratos]
supersedes: []
related: [0006, 0013, 0015, 0018, 0023, .contexts/engineering/contracts/firebase-firestore.md, .contexts/engineering/rules/migration.md]
---

# ADR-0028 — O código se conforma ao contrato do Firestore

## Status

`Proposed` — desde 2026-09-24. Pendente de revisão e aceite.

Histórico:
- 2026-09-24 — proposta. O dono do produto decidiu que o contrato do Firestore
  é a fonte da verdade e que o código que diverge dele deve ser corrigido, não
  o contrato reescrito para refletir o código.

## Contexto

`.contexts/engineering/contracts/firebase-firestore.md` (status `active`,
2026-05-20) governa como modelamos dados no Firestore. Ele diz que "toda nova
coleção, campo ou hierarquia DEVE consultar este contrato antes de ser criada".
O código não o segue. A divergência apareceu no estudo do módulo de Fontes,
quando a proposta de nomes precisou escolher entre o padrão do código e o do
contrato.

### O que o contrato manda e o que o código faz

Levantamento de 2026-09-24, feito com grep sobre `src/`, `app/`, `scripts/`,
`firestore.rules` e `firestore.indexes.json`:

| Regra do contrato | Seção | Estado no código |
|---|---|---|
| Coleções em kebab-case plural | §1 | 11 de 22 coleções divergem (tabela abaixo) |
| Enums em SCREAMING_SNAKE_CASE | §14 | 21 enums em 9 schemas usam minúsculas ou rótulos de exibição |
| ID estável; nunca slug livre de usuário como id primário | §2 | `clients`, `products`, `dataContracts`, `relations`, `dashboardTemplates` usam `Slug`; `metrics` usa `namespace.nome`; `dataSources` é tipado `Slug`, mas o id tem de ser o id do projeto GCP (ver Fase D) |
| Audit fields `createdAt`, `updatedAt`, `createdBy`, `updatedBy` | §5 | Nenhum dos 16 arquivos de `src/shared/schemas/` (incluindo `ai-studio/`) declara `createdBy`; `createdAt` aparece em 7 deles, tipado como `z.unknown()` |
| Soft delete (`deletedAt`, `deletedBy`) em entidade com audit | §5 | Nenhum schema declara |
| `schemaVersion` em documento que evolui | §17 | Nenhum schema declara |

Coleções fora do padrão e onde aparecem:

| Coleção atual | Arquivos em `src`/`app` | `firestore.rules` | `firestore.indexes.json` | `scripts/` |
|---|---|---|---|---|
| `dataContracts` | 13 | 0 | 0 | 9 |
| `dashboardTemplates` | 7 | 0 | 0 | 6 |
| `dataSources` | 2 | 1 | 0 | 4 |
| `sqlCatalog` | 4 | 1 | 7 | 4 |
| `sqlCatalogEvents` | 1 | 1 | 1 | 1 |
| `embeddingsDocs` | 4 | 1 | 1 | 4 |
| `embeddingsSql` | 7 | 1 | 1 | 2 |
| `embeddingsBlocks` | 4 | 1 | 1 | 2 |
| `evalRuns` | 2 | 1 | 3 | 1 |
| `judgeDrift` | 3 | 1 | 2 | 1 |
| `workingMemory` | 1 | 1 | 0 | 2 |

As demais (`clients`, `metrics`, `groups`, `users`, `reports`, `entities`,
`products`, `attributes`, `relations`, `conversations`, `revisions`,
`messages`) já são uma palavra no plural e atendem o §1.

### Por que isso importa agora

- **O contrato perde valor se não descreve o sistema.** Quem lê o contrato,
  humano ou Claude Code, cria código novo no padrão errado, ou copia o código
  e perpetua a divergência. Foi o que quase aconteceu no módulo de Fontes.
- **Os ids por slug já custam.** O id do cliente (`vila-rosa`) deriva nome de
  dataset BigQuery (`tenantDatasetSegment` em `src/shared/config/tenants.ts`)
  e entra no claim `clientIds` dos usuários (ADR-0018). Renomear um cliente
  hoje é inviável sem migração.
- **Sem `createdBy` não há trilha de quem mudou configuração** — relevante
  desde que a IA cria e corrige métricas (ADR-0023, ADR-0024).

### Restrições

- Os dados estão em produção (tenant `vila-rosa` e demos). Toda mudança segue
  `.contexts/engineering/rules/migration.md`: expandir, migrar, contrair, cada
  passo deployável e reversível, backfill idempotente.
- Nem todo `z.enum` é um enum de estado. Parte dos valores é gramática da
  receita de métrica (agregação, grão de tempo, operador de filtro, direção de
  ordenação) ou valor de sistema externo (location do BigQuery). Converter
  esses valores quebraria receitas e SQL sem ganho de clareza.

## Decisão

**Adotamos o contrato do Firestore como regra do código existente, e
migramos o código em quatro fases independentes, cada uma no padrão
expandir → migrar → contrair. Código novo nasce conforme a partir da aceitação
desta ADR.**

### Regra para código novo (vale imediatamente após o aceite)

Toda coleção, campo ou enum novo segue o contrato. O módulo de Fontes é o
primeiro caso: `clients/{clientId}/sources/{sourceId}` e `runs/{runId}` com
ids ULID, enums em SCREAMING_SNAKE, audit fields, soft delete e
`schemaVersion`. Revisão de código recusa coleção ou enum novo fora do padrão.

### Emenda ao contrato (parte desta decisão)

O §14 do contrato passa a distinguir dois tipos de valor:

- **Enum de domínio** (estado, categoria, papel, tipo): SCREAMING_SNAKE_CASE,
  como hoje.
- **Valor de gramática ou de sistema externo**: mantém a forma nativa. Casos
  deste projeto: `MetricAggregation`, `TimeGrain`, `FilterOp`, direção de
  ordenação (`asc`/`desc`) em `metric.ts`, e `BigQueryLocation` em
  `data-source.ts`.

A emenda é feita no próprio contrato, no mesmo PR que aceitar esta ADR.

### Fase A — Enums de domínio

| Schema | Enum | Hoje | Depois |
|---|---|---|---|
| `client.ts` | `granularity` | `contrato`, `safra`, `carteira` | `CONTRATO`, `SAFRA`, `CARTEIRA` |
| `dashboard-template.ts` | `TemplateSegment` | `sbpe`, `mcmv`, `both` | `SBPE`, `MCMV`, `BOTH` |
| `dashboard-template.ts` | `TemplateCategory` | `Carteira`, `Risco`, `Operacional`, `Covenants`, `Imobiliária` | `CARTEIRA`, `RISCO`, `OPERACIONAL`, `COVENANTS`, `IMOBILIARIA`, com mapa de rótulo para exibição |
| `dashboard-template.ts`, `product.ts`, `common.ts` | `TemplateStatus`, `ProductStatus`, `AiStatus` | `active`, `draft`, `archived` | `ACTIVE`, `DRAFT`, `ARCHIVED` |
| `data-contract.ts` | `DataContractStatus` | `draft`, `active`, `deprecated` | `DRAFT`, `ACTIVE`, `DEPRECATED` |
| `metric.ts`, `product.ts` | `MetricType`, `IndicatorType` | `kpi`, `chart`, `table` | `KPI`, `CHART`, `TABLE` |
| `metric.ts` | `MetricStatus` | `active`, `deprecated` | `ACTIVE`, `DEPRECATED` |
| `metric.ts` | `origin` | `admin`, `chat` | `ADMIN`, `CHAT` |
| `relation.ts` | `RelationCardinality` | `one-to-one` e demais | `ONE_TO_ONE` e demais |
| `agent.ts` | `ModelTier`, `AgentKind` | minúsculas | SCREAMING_SNAKE |
| `common.ts` | `AiOrigin` | `system`, `user` | `SYSTEM`, `USER` |

1. **Expandir.** O schema aceita as duas formas na leitura
   (`z.preprocess` que normaliza para maiúsculas) e escreve só a nova.
   `TemplateCategory` ganha o mapa id → rótulo, e a UI passa a exibir o rótulo.
2. **Migrar.** Script idempotente por coleção reescreve os valores antigos.
3. **Contrair.** O `z.preprocess` sai; valor antigo passa a falhar na leitura.

É a fase mais barata e a primeira, porque não muda path nem id.

### Fase B — Nomes de coleção

| Hoje | Depois |
|---|---|
| `dataContracts` | `data-contracts` |
| `dashboardTemplates` | `dashboard-templates` |
| `dataSources` | `data-sources` |
| `sqlCatalog` | `sql-catalog-entries` |
| `sqlCatalogEvents` | `sql-catalog-events` |
| `embeddingsDocs` | `doc-embeddings` |
| `embeddingsSql` | `sql-embeddings` |
| `embeddingsBlocks` | `block-embeddings` |
| `evalRuns` | `eval-runs` |
| `judgeDrift` | `judge-drift-records` |
| `workingMemory` | `working-memories` |

1. **Expandir.** Todo acesso passa por uma constante única por coleção
   (hoje parte do código usa string literal). Regras e índices da coleção nova
   são publicados antes de qualquer escrita nela.
2. **Migrar.** Por coleção: script de cópia idempotente, com checkpoint e
   subcoleções incluídas; leitura na nova com fallback na antiga; escrita
   dupla durante a janela.
3. **Contrair.** Escrita só na nova; remoção das regras e índices antigos; a
   coleção antiga é apagada depois de uma janela de observação, com export
   prévio.

Ordem sugerida, das coleções efêmeras para as de configuração:
`judge-drift-records`, `eval-runs`, `sql-catalog-events`, embeddings,
`working-memories`, `sql-catalog-entries`, `data-sources`,
`dashboard-templates`, `data-contracts`. O `CLAUDE.md` do projeto, que lista
nomes de coleção, é atualizado no fim da fase.

### Fase C — Audit fields, soft delete e `schemaVersion`

Mudança aditiva, sem troca de path ou id.

- Todo schema de entidade de negócio ganha `createdAt`, `updatedAt`
  (`Timestamp`, gravados com `serverTimestamp()`), `createdBy`, `updatedBy`
  (UID do ator, ou `system` em scripts, jobs e escritas da IA) e
  `schemaVersion` (começa em 1).
- Soft delete (`deletedAt`, `deletedBy`) nas entidades com referência externa
  ou necessidade de recuperação: clientes, produtos, contratos de dados,
  métricas, templates, grupos e relatórios. Hard delete continua permitido nas
  efêmeras: embeddings, memória de trabalho com TTL, execuções de eval.
- Os repositórios passam a filtrar `deletedAt == null` na leitura.
- Backfill: `createdBy = 'system'` e `schemaVersion = 1` onde o campo não
  existe; `createdAt` preservado quando existe.

### Fase D — Ids estáveis no lugar de slug

A mais cara, e a única com decisão de desenho ainda aberta. O contrato proíbe
"slug livre de usuário como ID primário" e manda manter o slug como campo
indexado mutável.

Pontos que dependem hoje do id por slug e precisam de inventário antes do
plano:

- **Cliente.** O id deriva o nome de datasets BigQuery
  (`tenantDatasetSegment`), entra no claim `clientIds` e em
  `users/{id}.adminClientIds` (ADR-0018), e aparece em rotas e seeds. O nome
  de dataset passa a derivar de um campo `slug` imutável, não do id.
- **Métrica.** O id `namespace.nome` é referenciado nos `blockMap` de
  relatórios e templates, em `enabledIndicators`, em relações e no catálogo
  SQL, e é o nome que a IA usa ao criar e corrigir métricas (ADR-0023,
  ADR-0024).
- **Destino de dados (`dataSources`).** Não é slug livre: o id tem de ser o
  id do projeto GCP. O schema tipa o id como `Slug` e guarda o projeto em
  `projectId`, e o executor de métricas usa `projectId`. Mas o front monta
  `<dataSourceId>.<datasetId>` (`useActiveClient.ts`), e o `filter-options` e
  as tools de IA leem esse valor como `projeto.dataset`. Um id diferente do
  projeto quebra o filtro de período e as tools. É o candidato natural à
  exceção de chave de sistema estável abaixo. A alternativa é o front passar
  a usar `projectId`, o que tira do id a obrigação de repetir o projeto.
- **Produto, contrato de dados, relação, template.** Referências cruzadas em
  bindings, receitas e seeds.

A Fase D ganha plano próprio em `docs/superpowers/plans/` depois das fases A
a C, com o inventário de referências medido. Se o inventário mostrar que
algum id é chave de sistema estável, e não slug livre de usuário, a exceção é
registrada no contrato no mesmo movimento da emenda do §14, e não decidida
caso a caso no código.

### Proteção contra regressão

Um teste unitário varre os nomes de coleção declarados e os `z.enum` de
`src/shared/schemas/` e falha quando encontra coleção fora de kebab-case
plural ou enum de domínio fora de SCREAMING_SNAKE, com a lista de exceções da
emenda como allowlist explícita. Ele entra desligado para os casos legados e é
apertado ao fim de cada fase.

## Consequências

### Positivas

- O contrato volta a descrever o sistema; código novo, humano ou gerado, tem
  uma única referência.
- `createdBy` e soft delete dão trilha de auditoria para configuração editada
  por pessoas e pela IA.
- Depois da Fase D, renomear um cliente ou uma métrica deixa de ser migração.
- O teste de regressão impede que a divergência volte.

### Negativas / Trade-offs

- Custo de engenharia relevante, dominado pela Fase D. As fases A a C cabem
  em planos curtos; a D precisa de um plano próprio e de janela de migração.
- Escrita dupla e leitura com fallback durante a Fase B aumentam leituras e
  complexidade temporária nos repositórios.
- Scripts e seeds antigos param de funcionar a cada contração e precisam ser
  atualizados junto.

### Neutras

- A emenda ao §14 muda o contrato. Ela restringe o alcance da regra ao que ela
  pretende cobrir, sem relaxar a regra para enums de domínio.
- A ordem das fases é recomendação; cada fase pode ser adiada sem bloquear as
  outras, exceto a D, que depende da C para ter `slug` como campo.

## Alternativas consideradas

### Alternativa A — Reescrever o contrato para refletir o código
**Pros**: custo zero de migração. **Cons**: o contrato deixaria de ser fonte
da verdade e passaria a documentar o que existe, incluindo ids por slug e
ausência de auditoria. **Por que rejeitada**: decisão explícita do dono do
produto em 2026-09-24; o contrato manda, o código se conforma.

### Alternativa B — Só código novo segue o contrato; o legado fica como está
**Pros**: nenhum risco em produção. **Cons**: dois padrões convivendo para
sempre, e o legado continua sendo copiado por quem lê o código. **Por que
rejeitada**: é a situação que produziu a divergência atual.

### Alternativa C — Migração única, em um deploy
**Pros**: termina rápido. **Cons**: viola a regra de migração do projeto
(nenhum deploy quebra o app em runtime), exige janela de indisponibilidade e
não tem rollback seguro para rename de coleção com dado em produção. **Por que
rejeitada**: risco desproporcional.

## Implementação

- Emenda do §14 em `.contexts/engineering/contracts/firebase-firestore.md`,
  no PR de aceite desta ADR.
- Um plano por fase em `docs/superpowers/plans/`, gerado com
  `writing-plans-ddc`, na ordem A, B, C, D.
- Scripts de migração em `scripts/migrations/`, idempotentes e com dry-run por
  padrão, como `scripts/bq-load-aux-tables.ts` já faz.
- Atualização do `CLAUDE.md` do projeto ao fim da Fase B.

## Referências

- `.contexts/engineering/contracts/firebase-firestore.md` — o contrato.
- `.contexts/engineering/rules/migration.md` — expandir, migrar, contrair.
- `.contexts/engineering/rules/development.md` — seção "Idioma dos
  identificadores", adicionada em 2026-09-24.
- ADR-0013 (Firestore como storage), ADR-0015 (camada semântica), ADR-0018
  (tenancy por usuário e `clientAdmin`), ADR-0023 e ADR-0024 (métricas criadas
  e corrigidas pela IA).
- Estudo do módulo de Fontes, que nasce conforme e expôs a divergência:
  https://claude.ai/artifact/WjVhkGdecwquhTeF2SQUD8
