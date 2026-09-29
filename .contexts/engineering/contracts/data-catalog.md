---
title: Catálogo de dados — contratos legíveis por humanos, compilador e IA
type: contracts
scope: metadados obrigatórios de contratos Zod, artefatos gerados (OpenAPI, JSON Schema, catálogo, views semânticas), gate de CI e uso dos contratos pela IA
status: active
last_updated: 2026-09-29
related:
  - "@.contexts/engineering/decisions/0011-contracts-as-machine-readable-data-catalog.md"
  - "@.contexts/engineering/contracts/schemas.md"
  - "@.contexts/engineering/contracts/api.md"
  - "@.contexts/engineering/contracts/events.md"
  - "@.contexts/engineering/rules/tenancy.md"
---

# Catálogo de dados

Este documento governa **o que todo contrato de dados carrega além da forma** e **como esse metadado vira artefato** para humanos, compilador e IA. A forma do schema (naming, variantes por boundary, branded IDs, versionamento) continua em `@.contexts/engineering/contracts/schemas.md`; a decisão e as alternativas rejeitadas, na `@.contexts/engineering/decisions/0011-contracts-as-machine-readable-data-catalog.md`.

O mesmo schema serve a cinco consumidores: a validação na borda, os tipos (`z.infer`), o OpenAPI, o `SchemaForm` e o runtime de IA. Nenhum deles mantém cópia própria de descrição, PII ou dica de UI.

## 1. Fonte única por tipo de contrato

| Contrato | Fonte | Local (monorepo, ADR 0006) | No catálogo |
|---|---|---|---|
| Entidade / documento | Zod | `packages/contracts/src/contracts/<context>/<entity>.schema.ts` (`<Entity>Schema`, `<Entity>DocSchema`) | sim |
| Comando / query (input e output) | Zod | `packages/contracts/src/contracts/<context>/` (`<Verb><Entity>InputSchema`, `<Entity>OutputSchema`) | sim |
| Settings (do usuário, nó, projeto, organização) | Zod | `packages/contracts/src/contracts/<context>/<name>-settings.schema.ts` | sim |
| Componente de UI gerativa | Zod | `packages/contracts/src/contracts/ui/<name>-part.schema.ts` (§10) | sim |
| Evento | Zod com o envelope de `@.contexts/engineering/contracts/events.md` §2, §6 | `packages/contracts/src/contracts/events/` | sim |
| Tabela Postgres | Drizzle → Zod (`drizzle-zod`) + teste de paridade (§7) | junto da tabela, em `packages/services/src/services/<context>/adapters/driven/` | não (o contrato de wire é que entra) |
| Estado de UI local | Zod no `model/` do slice | `packages/client/src/<layer>/<slice>/model/` | não |
| Input de use case só do server | Zod | `packages/services/src/services/<context>/application/use-cases/<uc>.schema.ts` | não, salvo quando vira tool (§9.4): aí sobe para `packages/contracts` |

Localização é a de `@.contexts/engineering/contracts/schemas.md` §2 com o prefixo de pacote de `@.contexts/engineering/architecture/monorepo.md`. Módulos seguem a mesma tabela dentro de `modules/<name>/` (contrato de módulo: SP0a Task 7).

## 2. Identidade do contrato

- **`id`**: `<context>.<Name>`, onde `<Name>` é o nome do schema sem o sufixo `Schema`. Ex.: `tenancy.Project`, `example.Note`, `example.CreateNoteInput`, `tenancy.ProjectCreatedEvent`, `ui.DataTablePart`. Módulo prefixa o próprio nome: `<module>.<context>.<Name>`.
- O `id` é **estável**: nunca muda enquanto o contrato existir. Renomear = contrato novo + deprecation (`@.contexts/engineering/contracts/schemas.md` §23).
- **Breaking change** gera schema paralelo e id novo: `example.NoteV2` (`NoteV2Schema`). O id antigo fica no catálogo com `deprecated: true` até sair (rule `migration`).
- **`kind`**: `entity` · `command` · `query` · `event` · `settings` · `ui-component`.

| ✅ | ❌ | Por quê |
|---|---|---|
| `tenancy.Project` | `Project` | sem contexto, colide entre módulos |
| `example.CreateNoteInput` | `example.create-note` | não bate com o nome do schema |
| `example.NoteV2` | `example.Note` com campo removido | breaking change sem id novo |

## 3. Metadados obrigatórios

| Chave | Nível | Obrigatório | Valor |
|---|---|---|---|
| `id` | schema | sim | §2 |
| `kind` | schema | sim | §2 |
| `description` | schema **e** campo | sim | frase em inglês, factual, do ponto de vista de quem consome; vira prompt e doc |
| `examples` | schema (campo: opcional) | sim, ≥ 1 | objetos **válidos** contra o próprio schema, com dados fictícios; nunca dado real |
| `pii` | schema **e** campo | sim | `none` · `personal` · `sensitive` |
| `tenancyScope` | schema | sim | `platform` · `org` · `project` · `unit` |
| `relations` | schema | sim (lista vazia é válida) | `[{ field, target, cardinality }]` |
| `permission` | schema | em `command` e `query` | `<module>.<resource>.<action>` (`@.contexts/engineering/rules/tenancy.md` §4) |
| `ui` | schema e campo | schema: em `command` e `settings`; campo: opcional | §3.4 |
| `deprecated` | schema e campo | não | `true` quando há substituto |

### 3.1 `pii`

Enquanto `@.contexts/business/compliance.md` for template, todo dado de usuário é PII sob LGPD (default conservador). Na dúvida entre dois níveis, use o mais alto.

| Nível | O que é | Exemplos |
|---|---|---|
| `none` | não se refere a pessoa | `status`, `createdAt`, `amountMinor`, `unitType`, IDs de nó |
| `personal` | identifica ou se refere a pessoa | nome, e-mail, telefone, IP, `userId`/`uid`, `createdBy`, texto livre escrito por usuário |
| `sensitive` | dado pessoal sensível (LGPD art. 5º II), documento de identificação, dado financeiro de pessoa, credencial | saúde, biometria, religião, CPF/RG, número de cartão, token, hash de API key |

- O `pii` do schema é **o maior** dos seus campos; o gate falha se for menor.
- `sensitive` **nunca** entra em contexto de modelo, em view semântica, em catálogo para IA, em log nem em `examples` (§5, rule `security` §13, §14).
- `personal` entra em contexto de modelo só dentro do tenant do principal, pelos caminhos da §9, e nunca em log.

### 3.2 `tenancyScope`

| Escopo | Campos exigidos no schema de entidade | Exemplo |
|---|---|---|
| `platform` | nenhum `tenantId` | `platform-staff`, `platform-audit-logs` |
| `org` | `tenantId` | `organizations`, `roles` |
| `project` | `tenantId`, `projectId`, `nodePath` | recursos de um projeto |
| `unit` | `tenantId`, `nodePath` | recursos presos a uma Unidade |

O gate confere os campos exigidos em `kind: "entity"` e `"event"` (evento sempre tem `tenantId` no envelope, `@.contexts/engineering/contracts/events.md` §2.1). Semântica de nó e `nodePath`: ADR 0010.

### 3.3 `relations`

```ts
relations: [
  { field: "projectId", target: "tenancy.Project", cardinality: "one" },
  { field: "attachmentIds", target: "files.File", cardinality: "many" },
]
```

- `target` é um `id` de contrato existente; o gate falha em alvo desconhecido.
- A relação é **lógica**: vale entre stores diferentes (Firestore ↔ Postgres, 0008), onde não há FK. FK física continua em `@.contexts/engineering/contracts/postgres.md`.

### 3.4 `ui`

| Chave | Nível | Valor |
|---|---|---|
| `widget` | campo | `text` · `textarea` · `number` · `money` · `select` · `multiselect` · `switch` · `date` · `datetime` · `timezone` · `locale` · `entity-ref` · `file` · `hidden` |
| `labelKey`, `helpKey` | campo e schema | chave i18n (`rules/internationalization`); nunca texto literal |
| `order` | campo | inteiro; ordem dentro do grupo |
| `group` | campo | chave de grupo declarada em `ui.groups` do schema |
| `groups` | schema | `[{ key, labelKey, order }]` |
| `readPermission`, `writePermission` | campo | `<module>.<resource>.<action>`; ausente = a permissão do contrato |

- Sem `widget`, o `SchemaForm` infere do tipo (enum → `select`, boolean → `switch`, `MoneySchema` → `money`, branded ID com relação → `entity-ref`).
- **Visibilidade por permissão é UX, não segurança.** O cliente esconde; o servidor aplica a mesma meta: o mapper de output omite campo sem `readPermission` e o use case responde `403` a escrita em campo sem `writePermission`, ambos via `authorize()`.

## 4. Registry: `defineContract` e `.meta()`

Dois mecanismos do Zod 4.6, com semânticas diferentes (medido no `zod@4.6.5`):

- `.meta(data)` devolve um **clone** registrado em `z.globalRegistry`. Quem não usa o valor devolvido perde o metadado.
- `.register(registry, meta)` registra **a própria instância** e a devolve.
- `z.toJSONSchema` copia **todos** os campos de metadado do registry de `metadata` (default `z.globalRegistry`) para o JSON Schema.

Por isso: **campo** usa `.meta()` (clone, seguro para primitivo reutilizado); **schema** usa `defineContract()`, que grava no `globalRegistry` (para o JSON Schema) e no `contractRegistry` tipado (para a enumeração e o tipo obrigatório).

```ts
// packages/contracts/src/contracts/primitives/catalog-meta.schema.ts
export const PiiSchema = z.enum(["none", "personal", "sensitive"]);
export const TenancyScopeSchema = z.enum(["platform", "org", "project", "unit"]);
export const CatalogMetaSchema = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*\.[A-Z][A-Za-z0-9]*$/),
  kind: z.enum(["entity", "command", "query", "event", "settings", "ui-component"]),
  description: z.string().min(1),
  examples: z.array(z.unknown()).min(1),
  pii: PiiSchema,
  tenancyScope: TenancyScopeSchema,
  relations: z.array(z.strictObject({
    field: z.string().min(1), target: z.string().min(1), cardinality: z.enum(["one", "many"]),
  })),
  permission: z.string().regex(/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/).optional(),
  ui: z.looseObject({}).optional(), // shape em §3.4; loose: grupos e chaves evoluem aditivamente
  deprecated: z.boolean().optional(),
});
export type CatalogMeta = z.infer<typeof CatalogMetaSchema>;
export type Pii = z.infer<typeof PiiSchema>;
```

```ts
// packages/contracts/src/contracts/registry.ts
import { z } from "zod";
import { CatalogMetaSchema, type CatalogMeta, type Pii } from "./primitives/catalog-meta.schema";

declare module "zod" {
  interface GlobalMeta { pii?: Pii; ui?: Record<string, unknown>; examples?: unknown[] }
}

export const contractRegistry = z.registry<CatalogMeta>();
const contractsById = new Map<string, z.ZodType>(); // _idmap do registry é interno: não usar

export const defineContract = <S extends z.ZodType>(schema: S, meta: CatalogMeta): S => {
  const parsed = CatalogMetaSchema.parse(meta); // metadado inválido = erro no import (bug)
  if (contractsById.has(parsed.id)) throw new Error(`duplicate contract id ${parsed.id}`);
  const withMeta = schema.meta(parsed); // clone no globalRegistry → JSON Schema
  contractRegistry.add(withMeta, parsed);
  contractsById.set(parsed.id, withMeta);
  return withMeta;
};

export const listContracts = () => [...contractsById.values()];
```

```ts
// packages/contracts/src/contracts/example/note.schema.ts (contrato neutro de exemplo)
// NoteIdSchema, TenantIdSchema, ProjectIdSchema, NodePathSchema, UserIdSchema e IsoDateTimeSchema: primitivos/IDs branded
export const NoteSchema = defineContract(
  z.strictObject({
    id: NoteIdSchema.meta({ description: "Opaque note identifier.", pii: "none" }),
    tenantId: TenantIdSchema.meta({ description: "Owning organization.", pii: "none" }),
    projectId: ProjectIdSchema.meta({ description: "Project the note belongs to.", pii: "none" }),
    nodePath: NodePathSchema.meta({ description: "Node ids from the organization to the note's node.", pii: "none" }),
    title: z.string().min(1).max(200).meta({
      description: "Short title shown in lists.", pii: "personal",
      ui: { widget: "text", labelKey: "example.note.title", order: 1 },
    }),
    createdBy: UserIdSchema.meta({ description: "User who created the note.", pii: "personal" }),
    createdAt: IsoDateTimeSchema.meta({ description: "Creation instant, UTC.", pii: "none" }),
  }),
  {
    id: "example.Note", kind: "entity", pii: "personal", tenancyScope: "project",
    description: "A free-text note attached to a project.",
    examples: [{ id: "n1", tenantId: "t1", projectId: "p1", nodePath: ["t1", "p1"],
      title: "Kickoff", createdBy: "u1", createdAt: "2026-09-29T12:00:00.000Z" }],
    relations: [{ field: "projectId", target: "tenancy.Project", cardinality: "one" }],
  },
);
export type Note = z.infer<typeof NoteSchema>;
```

- Todo schema **exportado** de `packages/contracts` passa por `defineContract`, exceto primitivos (`primitives/`) e sub-objetos só usados dentro de outro contrato (estes levam `.meta()` por campo).
- `.describe()` continua válido para campo, mas não carrega `pii`: prefira `.meta({ description, pii })`.
- `@core/contracts` não importa outro pacote do workspace (ADR 0006); o registry é só Zod.

## 5. Artefatos gerados (`pnpm contracts:catalog`)

O gerador (`packages/contracts/scripts/build-catalog.ts`) percorre `listContracts()` e emite, com saída determinística (chaves ordenadas, sem timestamp):

| Artefato | Conteúdo | Consumidor |
|---|---|---|
| `docs/catalog/catalog.json` | índice: `id`, `kind`, `context`, `description`, `pii`, `tenancyScope`, `relations`, `permission`, `deprecated`, caminho do JSON Schema | tooling, `/admin`, testes |
| `docs/catalog/<context>/<Name>.schema.json` | JSON Schema 2020-12 do contrato | validadores externos, MCP |
| `docs/catalog/<context>/<Name>.md` | página humana: descrição, campos, PII, relações, exemplos | pessoas, revisão de PR |
| `docs/catalog/catalog.ai.json` | projeção **sem campos `sensitive`** e sem `examples` de campos `personal` | knowledge base, `describeEntity`, resources MCP (§9.1) |
| `docs/openapi/v1.yaml` | OpenAPI 3.1 das rotas `/v1` (`@.contexts/engineering/contracts/api.md` §15) | integradores |
| `docs/catalog/sql/{postgres,bigquery}/<view>.sql` | DDL das views semânticas (§8) | migration que cria/atualiza a view |

Regras do gerador:

- `z.toJSONSchema(schema, { io, target: "draft-2020-12", unrepresentable: "throw" })`. **Input** de comando/query com `io: "input"`; entidade, output e evento com `io: "output"`. `unrepresentable: "throw"` é obrigatório: `z.date()`, `bigint`, `transform` sem `pipe` e `custom` num contrato são erro, não `{}` silencioso.
- As chaves de catálogo saem como extensões `x-` via `override`: `x-pii`, `x-tenancy-scope`, `x-relations`, `x-ui`, `x-permission`, `x-kind`. `description`, `examples` e `deprecated` ficam com o nome padrão do JSON Schema.
- Com `io: "input"`, o Zod descarta `examples` de schemas com transform; o gerador valida os exemplos contra o schema antes, então o exemplo continua testado.
- Como a lib de OpenAPI lê o metadado do `globalRegistry` sem `.openapi()`: medir na instalação (SP0b Task 4). Não confirmado.

## 6. Gate de CI (`pnpm contracts:check`)

Regenera tudo em memória e **falha** quando:

1. qualquer artefato da §5 difere do que está commitado (catálogo desatualizado);
2. campo de contrato sem `description` ou sem `pii`, ou schema com `pii` menor que o maior dos campos;
3. `examples` vazio ou exemplo que não passa no `safeParse` do próprio schema; exemplo com valor em campo `sensitive`;
4. `tenancyScope` sem os campos exigidos (§3.2) ou `relations.target` desconhecido;
5. `command`/`query` sem `permission`, ou `command`/`settings` sem `ui` de schema;
6. **breaking change** em `id` existente, comparando com o JSON Schema commitado: campo removido, tipo mudado, opcional → obrigatório, valor de enum removido, `pii` rebaixado. Saída: id novo (§2) e expand → migrate → contract (rule `migration`, `@.contexts/engineering/contracts/schemas.md` §11);
7. id duplicado ou fora do formato da §2.

Roda como task Turbo (`@.contexts/engineering/architecture/monorepo.md`, "Pipelines Turbo") em todo PR que toca `packages/contracts/**` ou `modules/**`.

## 7. Paridade Drizzle ↔ Zod

- Tabela Postgres do projeto (schema `ai`, ADR 0008) deriva o schema de DB com `drizzle-zod` (`createSelectSchema`, `createInsertSchema`, `createUpdateSchema`), versão `0.8.3` medida em 2026-09-29. `drizzle-orm/zod` só existe na linha `1.0.0-rc` e não é usado (ADR 0004).
- O `<Entity>DbSchema` **não** entra no catálogo: `timestamp` em modo `date` vira `z.date()`, irrepresentável em JSON Schema. O que entra é o contrato de wire, ligado por mapper (`@.contexts/engineering/contracts/schemas.md` §8, §17).
- Todo par tabela ↔ contrato tem **teste de paridade** colocado ao lado do mapper, que falha quando:
  - uma coluna não tem campo correspondente no contrato (snake_case → camelCase, `rules/data-modeling`) nem está na lista explícita de colunas internas do teste;
  - um campo do contrato não tem coluna nem é derivado declarado no mapper;
  - nullability diverge (`NOT NULL` ↔ campo obrigatório);
  - o mapper não faz round-trip de uma linha gerada por factory (`mapper(row)` passa no `ContractSchema.parse`).
- O schema `mastra` é do adapter do Mastra (0008): sem contrato de catálogo, sem teste de paridade, nunca exposto à IA.

## 8. Views semânticas

A superfície SQL que a IA enxerga (§9.3). Uma view por contrato marcado para consulta, gerada do catálogo.

| Engine | Local | Naming | Isolamento |
|---|---|---|---|
| Postgres 18 | schema `semantic` | `v_<entity>` (`@.contexts/engineering/contracts/postgres.md`, "Views") | `WITH (security_invoker = true, security_barrier = true)` sobre tabelas com RLS por `tenant_id` e nós concedidos |
| BigQuery | dataset `<context>_semantic` | `<entity>` singular (`@.contexts/engineering/contracts/bigquery.md` §3) | tenant e nós como parâmetros obrigatórios ligados pelo servidor; mecanismo (table function parametrizada ou equivalente) definido no SP3. Não confirmado |

- Colunas = campos do contrato em snake_case, com `description` como comentário da coluna. Campos `sensitive` **nunca** viram coluna.
- Só contratos com `tenancyScope` diferente de `platform` e com fonte em Postgres `ai` ou BigQuery. Dados de aplicação do Firestore chegam à IA por SQL só depois do export para o BigQuery (0008, SP5).
- A view é a interface: tabela base nunca é referenciada pelo SQL da IA. Mudança de view segue rule `migration` e `@.contexts/engineering/contracts/bigquery.md` §11.

## 9. Uso pela IA

Toda chamada roda com o principal do usuário (ou device) no `RequestContext`, nunca com credencial própria do agente (ADR 0010, `@.contexts/engineering/rules/tenancy.md` §10). Nomes finais e shapes das tools: `contracts/agents.md` (SP0a Task 7).

### 9.1 Conhecer a estrutura

- Fonte: **só** `docs/catalog/catalog.ai.json` (sem `sensitive`). Ingerido na knowledge base (schema `ai`, `@.contexts/engineering/contracts/pgvector.md`) como namespace de plataforma do core + namespace de cada módulo instalado.
- Tools de leitura `listEntities` (ids, descrição, `kind`) e `describeEntity({ id })` (campos, relações, permissões, exemplos da projeção). Sem aprovação: não tocam dado de tenant.
- Resources MCP (`catalog://<id>`) servem o mesmo conteúdo no MCP server do core, atrás da mesma autenticação.
- `describeEntity` filtra contratos cujo `permission`/`readPermission` o usuário não tem no nó ativo: a IA não aprende o que o usuário não pode usar.

### 9.2 Formulários: `renderForm`

- A tool `renderForm({ contractId, prefill })` só aceita `contractId` de `kind` `command` ou `settings`. Ela **não executa nada**: emite a part `data-form` (§10) com `contractId` e `prefill`.
- `prefill` passa pelo `safeParse` parcial do input no servidor antes de sair; campos `sensitive` nunca são pré-preenchidos pelo modelo.
- O cliente renderiza o organism genérico `SchemaForm` (`packages/client/src/shared/ui/organisms/`) a partir do **JSON Schema com `io: "input"` + `x-ui`** do contrato, e valida com o mesmo schema Zod importado de `@core/contracts`.
- O submit vai para o `/v1` ou Server Action normal do comando: auth → validate (mesmo schema, na borda) → authorize → act. O form do chat não é atalho: é o mesmo endpoint da tela.

### 9.3 Consulta: SQL somente leitura

A tool de consulta recebe SQL do modelo e só executa se passar por todas as camadas:

1. **Parser real** de SQL (lib escolhida no SP3, pin em `stacks/VERSIONS.md`); nada de regex. Uma única instrução `SELECT` (CTE permitido); qualquer DML, DDL, `SET`, `COPY`, `CALL`, transação ou múltiplas instruções → rejeita.
2. **Allowlist no AST:** relações só das views semânticas da §8 às quais o usuário tem `permission` de leitura; funções só de uma allowlist (agregação, data, texto). `pg_*`, `dblink`, `set_config`, `lo_*`, funções de sistema e UDFs fora da lista → rejeita.
3. **`LIMIT` forçado:** o servidor envolve a consulta e aplica `LIMIT` ≤ 1000 (default 100), mesmo que o SQL traga outro.
4. **Role somente leitura:** Postgres com role dedicado só com `USAGE` em `semantic` e `SELECT` nas views, transação `READ ONLY`; BigQuery com service account que tem `roles/bigquery.dataViewer` só nos datasets `*_semantic` e `roles/bigquery.jobUser` no projeto.
5. **Tenant e nós pelo servidor:** `SET LOCAL app.tenant_id` (e nós concedidos por `authorize()`) antes da consulta no Postgres, com RLS (`@.contexts/engineering/contracts/postgres.md`, "Tenant isolation"); parâmetros ligados no BigQuery. Nunca vindos do modelo.
6. **Timeout e custo:** `SET LOCAL statement_timeout` (≤ 5 s) no Postgres; `jobTimeoutMs`, `dryRun` e `maximumBytesBilled` no BigQuery (`@.contexts/engineering/contracts/bigquery.md` §18). Estourou → erro para o modelo, sem retry automático.
7. **Resultado:** conta no orçamento de tokens do tenant; logado só com `requestId`, hash da consulta, views usadas, linhas e `durationMs` (nunca o resultado; rule `observability`).

Mutação por SQL não existe. Mudança de dado é comando (§9.4).

### 9.4 Ação: comandos como tools

- Cada contrato `kind: "command"` pode virar tool com **o mesmo `inputSchema`** (JSON Schema `io: "input"` para o modelo; Zod para validar no `execute`). Nada de schema de tool escrito à mão para um comando que já existe.
- O `execute` chama o **mesmo use case** exposto pelo `exports` de `@core/services` que o `/v1` chama (fronteira da ADR 0006). Sem caminho paralelo.
- `authorize(principal, permission, nodeId)` com a identidade do usuário, e permissão efetiva = interseção entre o usuário e o teto do agente (ADR 0010).
- **Toda tool de mutação exige aprovação humana** antes do `execute` (rule `security` §14), com antes/depois na part `data-approval`; permissão `requiresApproval` ainda passa pelo fluxo de aprovação de `services/access` (outro principal). Aprovação e decisão vão para `audit-logs`.
- `kind: "query"` vira tool de leitura sem aprovação, com o mesmo `authorize()`.
- Output da tool passa pelo schema de output e pelo filtro de PII da §3.1 antes de voltar ao modelo.

## 10. UI gerativa

- Cada componente que o agente pode renderizar no chat é um contrato `kind: "ui-component"` em `packages/contracts/src/contracts/ui/`: `<Name>PartSchema`, id `ui.<Name>Part`, emitido como part `data-<name>` (kebab-case). Ex.: `data-form`, `data-data-table`, `data-chart`, `data-approval`, `data-picker`.
- O registry de UI gerativa é o conjunto desses contratos: o cliente passa os schemas em `dataPartSchemas` do chat (`ai@7`) e renderiza **só** nomes registrados; part desconhecida ou inválida vira fallback de texto, nunca HTML (rule `security` §5, §14).
- O servidor valida com o mesmo schema antes de escrever a part no stream.
- Props de componente carregam `contractId` e dados, nunca markup, URL de script ou estilo. URL de link passa por allowlist.
- Componentes visuais ficam em `packages/client/src/shared/ui/organisms/` (Atomic); o mapeamento `data-<name>` → componente fica no widget de chat (SP4).

## 11. Anti-patterns

- ❌ `z.string().meta({ description })` sem `pii` → ✅ `.meta({ description, pii })`.
- ❌ `NoteSchema.meta({...}); export { NoteSchema }` (clone descartado) → ✅ `export const NoteSchema = defineContract(...)`.
- ❌ `.register(contractRegistry, ...)` em primitivo reutilizado (muta a instância compartilhada) → ✅ `.meta()` no campo.
- ❌ Prompt com lista de entidades escrita à mão → ✅ `describeEntity` sobre `catalog.ai.json`.
- ❌ Schema de tool duplicando `CreateNoteInputSchema` → ✅ tool gerada do contrato.
- ❌ SQL do modelo direto em tabela `ai.*` ou `mastra.*` → ✅ view de `semantic`.
- ❌ `unrepresentable: "any"` para o gate passar → ✅ contrato de wire com `IsoDateTimeSchema`.
- ❌ `labelKey: "Título"` → ✅ `labelKey: "example.note.title"`.
- ❌ Esconder campo no `SchemaForm` como controle de acesso → ✅ `authorize()` no use case.

## Referências cruzadas

- Decisão: `@.contexts/engineering/decisions/0011-contracts-as-machine-readable-data-catalog.md`.
- Forma, naming e versionamento de schema: `@.contexts/engineering/contracts/schemas.md`; imperativos: rules `validation`, `schemas`, `data-modeling`, `migration`.
- API, envelope de erro e OpenAPI: `@.contexts/engineering/contracts/api.md` (§6, §15).
- Eventos: `@.contexts/engineering/contracts/events.md`. Postgres: `@.contexts/engineering/contracts/postgres.md`. pgvector: `@.contexts/engineering/contracts/pgvector.md`. BigQuery: `@.contexts/engineering/contracts/bigquery.md`.
- Tenancy, `authorize()`, aprovação e audit: `@.contexts/engineering/rules/tenancy.md`, `@.contexts/engineering/decisions/0010-tenancy-organization-project-units-and-rbac.md`.
- Segurança de IA, PII e SQL: `@.contexts/engineering/rules/security.md` (§5, §11, §13, §14).
- Zod 4: `@.contexts/engineering/stacks/validation/zod@4.md`. Pacotes e fronteiras: `@.contexts/engineering/architecture/monorepo.md`.
