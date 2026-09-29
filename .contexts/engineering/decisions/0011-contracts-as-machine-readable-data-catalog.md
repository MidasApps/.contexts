# 0011. Contratos como catálogo de dados legível por humanos, compilador e IA

- **Status:** accepted
- **Date:** 2026-09-29
- **Deciders:** projeto DDC / spec do core agêntico (`docs/superpowers/specs/2026-09-29-agentic-app-core-design.md`, D6, D7, §5, §7, §8)
- **Tags:** `engineering`, `contracts`, `schemas`, `zod`, `catalog`, `ai`, `openapi`
- **Supersedes:** em parte a [0008](0008-data-stores-split-firestore-postgres-storage-bigquery.md): só a regra "BigQuery nunca lido no caminho do request", e só para a leitura analítica da tool SQL do agente durante o chat (seção "Leitura analítica da IA no BigQuery"). Tela de aplicação e mutação continuam sem ler BigQuery.
- **Complements:** [0003](0003-cross-doc-convention-conflicts-resolved.md) (localização de schemas e envelope de erro seguem valendo), [0006](0006-monorepo-layout-and-package-boundaries.md) (`packages/contracts` = `@core/contracts`, sem dependência de outro pacote do workspace), [0008](0008-data-stores-split-firestore-postgres-storage-bigquery.md) (schema Postgres `semantic` e datasets BigQuery `<context>_semantic` para as views semânticas) e [0010](0010-tenancy-organization-project-units-and-rbac.md) (`authorize()`, `requiresApproval`, teto do agente e audit).

## Context

O core agêntico usa a mesma forma de dado em cinco lugares: validação na borda (`/v1`, Server Actions, Functions, consumidores de fila), tipos TypeScript, documentação para quem integra (OpenAPI), persistência (Firestore, Postgres, BigQuery) e o runtime de IA. A spec pede que a IA use essa forma para quatro coisas: saber o que existe, renderizar formulários no chat, consultar dados por SQL somente leitura e executar comandos como tools.

Hoje a doutrina já tem a fonte de verdade da **forma**: Zod em `src/contracts/<context>/` (`contracts/schemas.md` §1–§2), com `z.infer` para tipos e OpenAPI gerado dos schemas (`contracts/api.md` §15). Falta o que a IA e a UI genérica precisam e o compilador não expressa:

- o que um campo **significa** (descrição e exemplos obrigatórios, não só `.describe()` "quando usado em prompt", `contracts/schemas.md` §16, §20);
- a **classificação de PII** de cada campo, para decidir o que entra em contexto de modelo, em log e em view SQL (`business/compliance.md` ainda é template: todo dado de usuário é PII por default);
- o **escopo de tenancy** de cada entidade (ADR 0010: organização, projeto, unidade ou plataforma);
- **relações** entre entidades de stores diferentes, sem FK possível entre Firestore e Postgres (0008);
- dicas de **UI** (widget, chave de label, ordem, grupo, visibilidade por permissão) para um `SchemaForm` genérico.

Sem um lugar para isso, cada consumidor inventaria a própria cópia: um prompt com a descrição das entidades, um JSON de formulário, uma lista de colunas "seguras" para SQL. Cada cópia deriva da forma real em semanas.

Fatos medidos em 2026-09-29 (`npm pack zod@4.6.5`, leitura de `v4/core/registries.d.ts`, `to-json-schema.js` e `json-schema-processors.js`; zod.dev/metadata e zod.dev/json-schema):

- `z.registry<Meta>()` cria um registry tipado. `.register(registry, meta)` adiciona **a própria instância** e a devolve (único método que não clona). `.meta(data)` devolve um **clone** registrado em `z.globalRegistry`.
- `GlobalMeta` (`id`, `title`, `description`, `deprecated` + chaves livres) aceita augmentation por declaration merging (`declare module "zod"`).
- `z.toJSONSchema(schema, params)` copia **todos** os campos de metadado do registry de `params.metadata` (default `z.globalRegistry`) para o JSON Schema, com precedência sobre as palavras-chave geradas; aceita `io: "input" | "output"`, `target` (`draft-2020-12` default, `draft-07`, `draft-04`, `openapi-3.0`), `unrepresentable: "throw"` (default) | `"any"` | função, `cycles`, `reused` e `override`. Com `io: "input"`, `examples` e `default` de schemas com transform são descartados. Metadado com `id` vira `$defs`; dois schemas com o mesmo `id` na mesma conversão lançam erro.
- `drizzle-orm@0.45.3` (latest) não exporta `drizzle-orm/zod`; esse subpath só existe na linha `1.0.0-rc` (pré-release, fora do baseline pela 0004). O pacote atual é **`drizzle-zod@0.8.3`** (latest; peers `drizzle-orm >=0.36.0`, `zod ^3.25.0 || ^4.0.0`; importa `zod/v4`), com `createSelectSchema`, `createInsertSchema`, `createUpdateSchema` e `createSchemaFactory`.
- `ai@7.0.122` tipa data parts como `` `data-${NAME}` `` e aceita `dataPartSchemas` em `ChatInit`; exporta `validateUIMessages`.

## Decision Drivers

- **Uma fonte por forma de dado.** Tipo, validação, OpenAPI, formulário, tool e descrição para a IA vêm do mesmo schema.
- **Legível pela IA sem vazar dado.** A IA conhece a estrutura; campos `sensitive` nunca entram em contexto de modelo (rule `security` §13, §14).
- **Verificável no CI.** Catálogo desatualizado, campo sem descrição ou sem PII e breaking change sem versão nova quebram o build.
- **Guard-rails fortes para ação da IA.** SQL só leitura sobre superfície controlada; mutação passa por `authorize()`, confirmação do usuário e, quando a permissão é `requiresApproval`, aprovação de outro principal (0010).
- **Contratos sem dependência interna.** `@core/contracts` não depende de outro pacote do workspace (0006) e usa só o Zod do baseline.
- **Genérico.** O catálogo descreve contratos do core e de módulos, sem conhecer domínio.

## Considered Options

1. **Zod só com documentação ad hoc.** Schemas Zod como hoje; descrições, PII e dicas de UI em Markdown escrito à mão, prompts e configs de formulário.
2. **Fonte separada: JSON Schema ou OpenAPI-first.** Contrato escrito em YAML/JSON Schema com extensões `x-`; Zod gerado a partir dele.
3. **Zod + registry de metadados tipado que gera o catálogo.** Zod continua fonte da forma; metadados obrigatórios via `.meta()` (campo) e `defineContract()` num `contractRegistry` tipado (schema); um gerador emite OpenAPI, JSON Schema, catálogo e views semânticas, e o CI verifica.

## Pros and Cons of the Options

**1. Zod + docs ad hoc**
- \+ Nenhuma ferramenta nova.
- − Metadado fora do schema deriva: descrição, PII e UI não acompanham a mudança de campo.
- − PII não é verificável; nada impede um campo sensível de ir para o prompt.
- − Cada consumidor de IA (prompt, formulário, SQL) mantém a própria lista.

**2. JSON Schema / OpenAPI-first**
- \+ Formato neutro de linguagem, com extensões `x-` padronizadas.
- − Inverte a doutrina vigente (`contracts/schemas.md` §1, `contracts/api.md` §15: OpenAPI é gerado do Zod, não o contrário) e as regras `schemas` e `validation`.
- − Refinements, branded types e transforms do Zod não voltam de JSON Schema sem perda; tipos gerados perdem `brand`.
- − Um passo de codegen entre contrato e código em todo PR.

**3. Zod + registry tipado + catálogo gerado**
- \+ A forma continua onde já está; o metadado fica no mesmo arquivo do campo e muda no mesmo diff.
- \+ `z.toJSONSchema` já copia o metadado para JSON Schema: o catálogo sai do mesmo objeto que valida.
- \+ O parâmetro `meta: CatalogMeta` de `defineContract()` dá erro de compilação para metadado de schema incompleto (e `CatalogMetaSchema` valida em runtime); o `contracts:check` cobre o que o tipo não cobre (campo sem `description`/`pii`).
- − Mais verboso: todo campo de contrato exportado leva `.meta()`.
- − O gerador e o gate são código nosso a manter (SP0b Tasks 3–4).
- − `.meta()` clona: quem esquece de usar o valor devolvido perde o metadado (o gate detecta).

## Decision Outcome

**Opção 3.** A doutrina fica em `@.contexts/engineering/contracts/data-catalog.md`:

- **Fonte única por tipo de contrato** (tabela da spec §5): Zod em `packages/contracts` para entidade/documento, comando/query, settings e componente de UI gerativa; Zod com o envelope de `contracts/events.md` para evento; Drizzle → Zod (`drizzle-zod`) com teste de paridade para tabela Postgres; Zod no `model/` do slice para estado de UI local (fora do catálogo).
- **Metadados obrigatórios:** schema-level via `defineContract(schema, meta: CatalogMeta)` (o tipo do parâmetro é o enforcement em compilação), que registra num `contractRegistry = z.registry<CatalogMeta>()` (`id` estável `<context>.<Name>`, `kind`, `description`, `examples`, `pii`, `tenancyScope`, `relations`, `ui`), que valida o metadado com `CatalogMetaSchema` e também o registra no `globalRegistry` para que `z.toJSONSchema` o copie; field-level via `.meta()` com `GlobalMeta` aumentado (`description`, `pii`, `examples`, `ui`). O `pii` do campo é o autoritativo; o do schema é só resumo (o maior dos campos) e sinal fraco.
- **Artefatos** gerados por `pnpm contracts:catalog` e verificados por `pnpm contracts:check`: `docs/openapi/v1.yaml`, JSON Schema por contrato, `docs/catalog/**` (`catalog.json`, projeção para IA sem `sensitive`, páginas Markdown) e SQL das views semânticas.
- **Quatro usos pela IA**, cada um com guard-rails no documento: conhecer (catálogo na knowledge base, tools `listEntities`/`describeEntity`, resources MCP), formulário (`renderForm` → `SchemaForm`), consulta (SQL só leitura sobre views semânticas) e ação (comando → tool com o mesmo `inputSchema`, `authorize()`, confirmação do usuário e, para permissão `requiresApproval`, aprovação de outro principal pela 0010).
- **UI gerativa:** cada componente é um contrato `kind: "ui-component"` em `packages/contracts`, emitido como part `data-<name>` e validado com o mesmo schema no servidor e no cliente (`dataPartSchemas`).

**Leitura analítica da IA no BigQuery (supersede em parte a 0008).** Decisão humana de 2026-09-29: a tool SQL do agente pode ler BigQuery durante o chat. Isso substitui, só para essa tool, a regra da 0008 "nunca lido no caminho do request". Condições:

- **Fail-closed:** o caminho BigQuery fica **desligado** até o SP3 definir e testar o isolamento por tenant. Até lá a tool só consulta Postgres `semantic`.
- Os datasets `<context>_semantic` contêm **só table functions parametrizadas**, nunca view ou tabela consultável direto. O servidor liga `tenantId` e os nós concedidos por `authorize()` como parâmetros e reescreve as referências de relação do SQL do modelo para a chamada da função.
- O AST rejeita literal de tenant ou de nó fornecido pelo modelo.
- Teto de custo (`maximumBytesBilled`, `dryRun` antes), timeout e limite de linhas iguais aos da §9.3 do contrato.

Tela de aplicação e mutação continuam sem ler BigQuery.

**PII em contexto de modelo** (decisão humana de 2026-09-29, o "isolamento explícito" da rule `security` §14): `sensitive` nunca entra; `personal` entra só dentro do tenant do principal **e** só quando o chamador tem a `readPermission` do campo (ou a permissão do contrato) no nó, conferida por `authorize()`. Mandar `personal` a provedor de LLM externo exige sign-off de compliance quando `business/compliance.md` for preenchido.

**Ratificado (2026-09-29):** `LIMIT` default 100 e máximo 1000; `statement_timeout` ≤ 5 s no Postgres; breaking change gera id `<context>.<Name>V2`; schema Postgres `semantic` e datasets `<context>_semantic` são desta ADR.

**Versões:** `drizzle-zod@0.8.3` entra no baseline (linha em `stacks/VERSIONS.md` e `MEMORY.md`); `drizzle-orm/zod` não é usado enquanto só existir em `1.0.0-rc`. A lib que monta o OpenAPI a partir do JSON Schema gerado é escolhida e medida na instalação (SP0b Task 4, 0004); `.openapi()` e `@asteasolutions/zod-to-openapi` deixam de ser prescritos (`contracts/schemas.md` §15). Nenhuma linha nova na tabela de exceções da 0004.

Por que não a 1: metadado fora do schema deriva e PII não se verifica, exatamente o que o uso pela IA não tolera. Por que não a 2: inverte a doutrina de schema-first em Zod e perde refinements e branded types na volta.

## Consequences

**Melhora:**
- A IA, o `SchemaForm`, o OpenAPI e as tools leem a mesma definição que valida a borda.
- PII e escopo de tenancy viram dado verificável: o gerador tira `sensitive` da projeção de IA e das views, e o gate falha em campo não classificado.
- Breaking change em contrato publicado quebra o CI em vez de quebrar cliente.

**Piora:**
- Todo contrato exportado ganha metadado obrigatório por campo; contratos existentes (quando houver código) migram de uma vez no pacote.
- Gerador, gate, teste de paridade Drizzle ↔ Zod e parser de SQL são código a manter.
- Views semânticas são uma superfície nova de schema com migração própria (rule `migration`): schema Postgres `semantic` (ao lado de `mastra` e `ai` da 0008; views com direitos do dono, um role dono sem login sujeito a `FORCE ROW LEVEL SECURITY` e um role de leitura da IA só com `USAGE` + `SELECT` nas views) e datasets BigQuery `<context>_semantic` só com table functions.
- O caminho BigQuery da tool SQL fica desligado até o SP3.
- `.meta()` clona e `.register()` não: a diferença precisa estar no helper, não na cabeça de quem escreve o contrato.

**Pontos em aberto:**
- Lib de parser SQL e teste do isolamento por tenant das table functions do BigQuery (condição para ligar esse caminho): SP3, com pin em `stacks/VERSIONS.md`.
- Lib que monta o OpenAPI a partir do JSON Schema gerado (e as chaves `x-`): medir na instalação (SP0b Task 4). Não confirmado.
- Nomes finais das tools (`listEntities`, `describeEntity`, `renderForm`, consulta SQL) e o gerador comando → tool: contrato de agentes (SP0a Task 7, `contracts/agents.md`).

**Arquivos que passam a mudar:**
- Novo `contracts/data-catalog.md`.
- `contracts/schemas.md` ganha a seção "Metadados de catálogo" (§5.1, link), e §15, §16, §20 e anti-patterns passam a apontar para `.meta()` + `data-catalog.md`; `contracts/api.md` §15 e `stacks/validation/zod@4.md` deixam de prescrever `zod-to-openapi`.
- `decisions/0008-...md` recebe as linhas `Superseded in part by:` e `Complemented by:`; `stacks/VERSIONS.md` e `MEMORY.md` ganham `drizzle-zod` 0.8.3.
- `contracts/api.md` §12: a linha de `POST /v1/auth/refresh` sai (conflito registrado na 0010).
- `MEMORY.md` (Contracts) e o índice de `decisions/README.md`.
- `.claude/`: skill `data-catalog` e rule path-scoped para `packages/contracts/**` (SP0a Task 10).

## References

- `docs/superpowers/specs/2026-09-29-agentic-app-core-design.md` §2 (D6, D7), §5, §7, §8
- `@.contexts/engineering/contracts/data-catalog.md`, `@.contexts/engineering/contracts/schemas.md`, `@.contexts/engineering/contracts/api.md` (§6, §12, §15), `@.contexts/engineering/contracts/events.md`, `@.contexts/engineering/contracts/postgres.md`
- `@.contexts/engineering/stacks/validation/zod@4.md`, `@.contexts/engineering/rules/security.md` (§11, §13, §14), `@.contexts/engineering/rules/tenancy.md`, `@.contexts/business/compliance.md`
- [0003](0003-cross-doc-convention-conflicts-resolved.md), [0004](0004-latest-stable-baseline-and-documented-exceptions.md), [0006](0006-monorepo-layout-and-package-boundaries.md), [0008](0008-data-stores-split-firestore-postgres-storage-bigquery.md), [0010](0010-tenancy-organization-project-units-and-rbac.md)
- https://zod.dev/metadata · https://zod.dev/json-schema
- https://orm.drizzle.team/docs/zod (`drizzle-zod`)
- `ai@7.0.122` `dist/index.d.ts` (`data-${NAME}`, `dataPartSchemas`, `validateUIMessages`)
