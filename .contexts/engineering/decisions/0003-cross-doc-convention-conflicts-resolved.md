# 0003. Conflitos de convenção entre documentos: qual vence

- **Status:** accepted
- **Date:** 2026-09-28
- **Deciders:** projeto DDC / auditoria de conformidade de `engineering/`
- **Tags:** `engineering`, `naming`, `architecture`, `ssot`
- **Complements:** [0002](0002-baseline-2026-09-version-and-naming-alignment.md) (pins e nomes por camada). Não altera IDs, harness nem secrets da 0001.

## Context

Uma auditoria em cinco frentes (nomenclatura, pins, links/índice, arquitetura/pastas, stacks × doc oficial) achou o mesmo assunto descrito de formas incompatíveis em documentos diferentes. Sem uma regra de desempate, um agente que lê dois arquivos escreve duas formas.

## Decision

Em cada conflito vence o documento mais específico do assunto, e o outro passa a apontar para ele.

| Assunto | Vence | Antes (divergia) |
|---|---|---|
| Envelope de erro `{ error: { code, message, details?, requestId } }` | `contracts/api.md` §6 | Rules achatavam `{ code, message, traceId }`; `error-handling` e `api-design` se apontavam em círculo |
| Paginação, ordenação, filtro | `contracts/api.md` (`meta.page`, `?sort=-createdAt`, `Min/Max`, `After/Before`) | `nextCursor`, `sortBy/sortOrder`, `priceGte` |
| Schema Zod | `UserSchema` em `user.schema.ts`; tipo por `z.infer` | `userSchema`, `user-schema.ts`, `schemas.ts`, `schema.ts` |
| OpenAPI | Zod primeiro; spec gerada em `docs/openapi/v1.yaml` | SDD mandava escrever a spec e gerar tipos |
| Camada de páginas do FSD | `src/views/` | `src/pages/` (o Next lê como Pages Router) |
| Backend por contexto | `src/services/<context>/`, árvore de `feature-based.md`; `clean-architecture` é superset opcional | Quatro árvores diferentes entre hexagonal, DDD e Clean |
| Entry points | `app/**/route.ts` e `actions.ts` são re-export fino que chama use case | Três lugares diferentes |
| Testes | Colocados (`foo.test.ts`), e2e em `e2e/`, `.spec.ts` só e2e; formato troféu; fakes em vez de spies | `__tests__/`, `tests/`, pirâmide, mocks de interação |
| `function` | Arrow por padrão; `function` permitida para componentes React, handlers de framework e exports nomeados | Rule proibia, mas os próprios exemplos usavam |
| Barrel | `index.ts` mínimo, só como API pública de slice/feature/contexto; sem `export *` | Rule proibia, FSD e feature-based exigiam |
| Nome de arquivo | Componente React em PascalCase; o resto em kebab-case | `createOrder.ts`, `RegisterUser.ts` em skills |
| Casos de uso e adapters | Função ou factory, constante em camelCase; classes só para erro de domínio e, opcionalmente, agregado; ports são `type` | `class RegisterUser`, `PostgresUserRepository` |
| Tenant | `tenantId` / `tenant_id`; `organizations/{orgId}` continua sendo só o path | `orgId`, `org_id`, `organizationId` como campo |
| Timestamps e logs | Sufixo `At`/`_at`; log com `timestamp`, `message`, `durationMs` | `event_time`, `timestamp`, `ts`, `msg`, `duration_ms` |
| Branch e commit | `processes/git.md` e `processes/commits.md`; `wip` só em branch local | Rules e processos discordavam |
| `Result` e retorno de Server Action | `{ ok: true, data } \| { ok: false, error }`; `error` é `{ code, message, details? }` do `contracts/api.md` §6 | `value`, `postId`, `{ ok: false, code }` achatado |
| Logger | `logger.info(message, fields)` (forma do `firebase-functions/logger`) | Estilo pino `(fields, msg)` em agents e skills |
| Frontmatter | `title`, `type` (= pasta), `status`, `last_updated`; stacks também `category` (= subpasta) e `version` | 17 arquivos sem frontmatter, `type` no singular, `category` fora da pasta |

Conteúdo obsoleto frente à documentação oficial foi corrigido no lugar, sem apagar arquivos: nenhum documento inteiro estava obsoleto.

## Consequences

- Rules sempre-ativas em `.claude/rules/` e skills passam a repetir só o essencial e apontar para a fonte.
- Exemplos que ainda usam forma antiga só se admitem como contra-exemplo rotulado.
- `rules/development.md` ganhou as exceções de `function` e barrel; quem ler só a rule já vê o desempate.
- Itens que não deu para confirmar na doc oficial ficaram como estavam e estão listados na entrega da auditoria, não nos contextos.

## Amendments

### 2026-09-28: lacunas achadas na auditoria de sincronização `.claude` × `.contexts`

Completam a tabela acima. A linha "Server Action" refina a linha "Entry points" só para `actions.ts`: `route.ts` continua re-exportando o driving adapter, e `actions.ts` passa a ser um wrapper `"use server"` de uma linha, não um re-export.

| Assunto | Vence | Antes (divergia) |
|---|---|---|
| Campo `timestamp` | Só no log. Campo de dado usa `*At` (`occurredAt`, não `at` nem `timestamp`) | A linha "Timestamps e logs" citava `timestamp` como vencedor e como forma antiga |
| Mensagem de log | String estável em snake_case: `logger.info("user_signed_in", { userId })` | Frase livre (`"user signed in"`) num lado, snake_case no outro |
| Onde mora o schema | Tabela de `contracts/schemas.md` §2: client ↔ server em `src/contracts/<context>/`; schema de slice do FSD em `src/<layer>/<slice>/model/<name>.schema.ts`; input de use case só do server em `src/services/<context>/application/use-cases/<use-case>.schema.ts` (`dto/` no superset Clean) | `src/features/<f>/` sem `model/`, `dto/`, `entities/.../model` para schema client+server |
| Schema persistido do Firestore | `<Entity>DocSchema` em `src/contracts/<context>/<entity>-doc.schema.ts` (forma gravada, usada pelo converter) | `UserSchema` no converter, `schemas/user-doc.ts` |
| Nome do schema de input | `<Verb><Entity>InputSchema` (`PlaceOrderInputSchema`, `CreatePostInputSchema`) | `PlaceOrderSchema`, `CreatePostSchema` |
| Arquivo de rota da API | `src/app/v1/<resource>/route.ts`, que atende a URL `/v1/<resource>` de `contracts/api.md` §2.1 | `app/api/**/route.ts`, `src/app/api/orders/route.ts` sem versão |
| Server Action | `src/app/<rota>/actions.ts` com `"use server"` e wrapper async de uma linha que chama o adapter em `src/services/<context>/adapters/driving/`; nada de lógica nem acesso a banco no arquivo. Erro de validação volta como `{ ok: false, error }` com `details: [{ field, issue }]` do §6; `z.flattenError()` não sai da action | Action com `db.insert` direto em `app/**/actions.ts`; `z.flattenError(err).fieldErrors` como retorno |
| Caminho do backend | `application/use-cases/<uc>.ts`, `adapters/driving/…`, `adapters/driven/…` (árvore de `architecture/feature-based.md`) | `application/<uc>.ts`, `adapters/<x>.ts`, `src/modules/…` |

## References

- [0002](0002-baseline-2026-09-version-and-naming-alignment.md)
- `contracts/api.md`, `contracts/schemas.md`, `rules/data-modeling.md`, `rules/development.md`, `architecture/feature-based.md`
