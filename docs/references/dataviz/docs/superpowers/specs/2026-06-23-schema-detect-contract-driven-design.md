# schema-detect contract-driven + aposentar legado (G7) — Design

> **Status:** aprovado para plano. Fecha o gap **G7** da auditoria e a peça de
> onboarding do **G8**. Depende da camada semântica (ADR-0015) já em vigor:
> `dataContracts/*`, `SemanticSchemaBinding` flat e `SchemaMapEditor` modo novo.

## Contexto

O `/api/schema-detect/v2` (auto-detecção de schema por IA no onboarding de cliente)
está quebrado para o modelo semântico:

1. **Depende de `product.expectedTables`** (deprecado, default `[]`) → produtos novos
   recebem **422**. Evidência: `schema-detect/v2/route.ts:74-79`; `product.ts:90`.
2. **Devolve o formato antigo** `{ tableId: { fieldId: coluna|null } }`, mapeado contra
   o dicionário `expectedTables` do produto — **não** contra os `entities/attributes`
   do Data Contract (a fonte semântica canônica).
3. **Pior que "formato errado": o resultado é descartado no modo novo.**
   `ClientForm.handleDetectBinding` busca o v2 e retorna o `schema` nested, mas
   `ProductBindingsEditor`/`SchemaMapEditor` invocam `onDetect()` como `() => Promise<void>`
   e nunca alimentam `onChangeBindings`. Para qualquer cliente baseado em contrato, o
   "Auto-detect" ou dá 422 (sem `expectedTables`) ou silenciosamente não faz nada.

A camada-alvo já existe: `dataContracts/{c}/entities/{e}/attributes/{a}`, o formato flat
`SemanticSchemaBinding` (`{"entity.attr": coluna|null}`), os helpers em
`flatten-binding.ts`, e o **modo novo** do `SchemaMapEditor` (lê o contrato via
`useContractSchema`, edita `schemaBindings`). Só o endpoint e a fiação do resultado
ficaram para trás.

Decisões do usuário nesta rodada:
- **Aposentar tudo** o legado de schema-detect (v1, `EXPECTED_SCHEMA`, `expectedTables`,
  modo legado do editor) — alinha com "sem clientes legado, só BRZ" (decisão do G5).
- Cobertura de onboarding **advisory** (não-bloqueante).
- Remover também o **modo legado do `ClientForm`** (`client.schema` top-level).

Referências: ADR-0015 (camada semântica), auditoria
`docs/auditoria-arquitetura-camada-semantica.md` (G7; peça de onboarding do G8). Não
cobre G9 (`/api/bigquery`).

## Arquitetura

### 1. Reescrever o endpoint → contract-driven, saída flat

`app/api/schema-detect/v2/route.ts` — **mantém o path `/v2`** (o caller `ClientForm` já o
usa; menor atrito) e passa a ser o único endpoint após a remoção do v1:

- **Input:** `{ productId, contractRef, dataSourceId, datasetId }`. `contractRef` dirige a
  detecção (o caller já tem `dataset.contractRef`); `productId` só escopa a checagem de
  cobertura (quais métricas são contratadas).
- Carrega `dataContracts/{contractRef}/entities/*` + `.../attributes/*` (atributos
  não-deprecated). Erro/contrato vazio ⇒ **422** com mensagem clara
  ("Configure o Data Contract antes de detectar").
- Resolve a tabela física por entidade via `tableBindings[entityId] ?? entityId` e
  consulta `INFORMATION_SCHEMA.COLUMNS` (reuso de `buildColumnsQuery`/`groupColumnsByTable`).
- Gemini mapeia coluna real → `entity.attribute`. O schema do `generateObject` é montado
  a partir das entidades/atributos do contrato; o resultado é achatado para
  **`SemanticSchemaBinding`** (`{"entity.attr": coluna|null}`). Coluna não encontrada ⇒
  `null` (atributo indisponível), nunca inventa.
- **Sem dependência de `product.expectedTables`.**
- Response: `{ data: { contractRef, schemaBindings, actualColumns, coverage } }`.

### 2. Aplicar o resultado no `schemaBindings` (corrige o no-op)

- `ClientForm.handleDetectBinding` passa a retornar `SemanticSchemaBinding`.
- `ProductBindingsEditor` → ao detectar, mescla no `dataset.schemaBindings` via
  `onChange({ schemaBindings, lastSchemaSync })`.
- `SchemaMapEditor` (modo novo): `onDetect` deixa de ser `() => Promise<void>` e passa a
  propagar o binding detectado para `onChangeBindings` (merge com o que o admin já editou:
  detecção preenche, edição manual prevalece quando o admin altera depois).

### 3. Checagem de cobertura no onboarding (G8) — advisory

- Reusar `collectBindingGaps(requires, binding, contractId)` (já existe, do runtime).
- Escopo: métricas contratadas do produto (`product.metricRefs` → `metric.requires[]`
  3-part) cujo `entity.attr` não tem binding ou está mapeado para `null`.
- O endpoint inclui `coverage: { missing: string[]; mappedNull: string[] }` na resposta;
  a UI mostra um aviso **não-bloqueante** ("N atributos exigidos por métricas contratadas
  sem coluna"). `null` é estado legítimo ⇒ **não** impede salvar.

### 4. Aposentar o legado

Remover (nenhum consumidor restante após as substituições acima):

- `app/api/schema-detect/route.ts` (v1).
- `EXPECTED_SCHEMA` + type `ExpectedTable` em `src/features/admin/model/types.ts`
  (dicionário hardcoded de crédito — duplicata D1 do schema hardcoded).
- `src/features/admin/ui/SchemaEditor.tsx` (editor v1, consome `EXPECTED_SCHEMA`).
- `src/features/admin/ui/ExpectedTablesEditor.tsx` (edita `product.expectedTables`) e seu
  export em `admin/ui/index.ts`.
- `product.expectedTables` + schema `ExpectedTable` em `src/shared/schemas/product.ts`.
- Modo legado do `SchemaMapEditor` (`LegacyEditor` + props `legacyTables`/`legacySchema`/
  `onChangeLegacy`) e os props/fios legados no `ProductBindingsEditor`.
- Modo legado do `ClientForm` (`mode==='legacy'`, `client.schema` top-level, `ClientSchema`,
  `handleDetect` v1) — só serve cliente não-migrado, inexistente.
- Consumidores que contavam `expectedTables` (`ProductSwitcher`, `ProductsTab`,
  `ProductForm` banner "produto legado") passam a usar só `entityRefs`.
- Atualizar seeds (`scripts/seed-play-product.mjs` etc.) e testes que setam
  `expectedTables: []` (`TemplateGallery.test`, `client-semantic-context.test`).

> Produtos no Firestore podem ter `expectedTables` residual; remover o campo do Zod o
> descarta na leitura (não-`.strict()`), sem migração de dados necessária.

## Error handling

- Contrato sem entidades/atributos ⇒ 422 legível (não 500).
- Coluna não-encontrada ⇒ `null`; nunca inventa coluna.
- Falha BQ/Gemini ⇒ 500 legível; o editor mantém o estado atual (detecção é aditiva).
- `getProduct`/contrato ausente ⇒ 404, como hoje.

## Testes (TDD)

- **Endpoint:** lê contrato (mock Firestore com entities/attributes), mapeia colunas reais
  → `SemanticSchemaBinding` flat, **sem** `expectedTables`; 422 em contrato vazio;
  `coverage` reporta `missing`/`mappedNull` corretos para `requires[]` das métricas.
- **Cobertura:** casos de `collectBindingGaps` (reuso) — attr sem binding, attr `null`,
  attr coberto.
- **UI:** `handleDetectBinding` aplica o `schemaBindings` retornado (antes era no-op);
  aviso advisory renderiza quando há gaps; não bloqueia salvar.
- **Retirement:** `tsc --noEmit` e a suíte seguem verdes após a remoção (zero import órfão);
  testes que referenciavam `expectedTables` atualizados.

## Não-objetivos (fora desta spec)

- **G9** — `/api/bigquery` legado fail-loud + guard `NEXT_PUBLIC_SEMANTIC_LAYER`.
- Popular os dados da BRZ (contrato/entities/attributes/bindings) — configuração.
- R2 Admin UI (editor de relações, builder `derived`, UI de promoção).
- Demais duplicações D2–D10; padronização de nomenclatura.
