---
title: Tenancy
category: rules
version: 1.0
last_updated: 2026-08-04
status: active
related: [ADR-0006, ADR-0018, rules/security, contracts/firebase-firestore]
---

# Tenancy — separação entre clientes

> **Por que este documento existe.** As convenções genéricas do harness
> (`contracts/firebase-firestore` §7, `rules/security` §11) prescrevem um modelo
> que **este produto não usa**: campo `tenantId` no documento + rule
> `resource.data.tenantId == request.auth.token.tenantId`. Aqui o tenant é
> `clientId`, a autorização é um **conjunto**, e há três eixos, não um. Até
> 2026-08-04 essa doutrina vivia inteira no JSDoc de um único arquivo
> (`src/shared/lib/api-auth.ts`), e já regrediu uma vez em produção.

## O modelo

Três eixos independentes decidem se uma requisição pode ler um dado:

| Eixo | Pergunta | Onde é verificado |
|---|---|---|
| **Tenant** | O usuário tem acesso a este cliente? | `verifyClientAccess` / `verifyDatasetAccess` |
| **Rota** | O usuário tem acesso a esta página? | `verifyRouteAccess` / `canAccessRoute` |
| **Papel** | O usuário pode administrar este cliente? | `getProvisionScope` / `verifyCanProvision` |

A fonte de verdade do eixo tenant é `users/{id}.clientAccess[]`. O claim
`clientIds[]` do token é **projeção read-only** dela (ADR-0018) — nunca o
contrário. Quem escreve `clientAccess` sincroniza o claim no mesmo fluxo, e o
claim nunca é a origem de uma concessão.

## Regras

- **O tenant é server-bound.** O `clientId` efetivo vem sempre do token ou do
  documento do usuário, **nunca de um campo do corpo da requisição aceito sem
  cross-check**. Quando o corpo traz `clientId` (é comum, para escolher entre os
  clientes a que o usuário tem acesso), ele é *validado contra* o conjunto do
  usuário — não usado como fonte.

- **Cross-check dataset ↔ cliente.** Toda rota que resolve um dataset BigQuery
  confere que aquele dataset pertence ao cliente autorizado. Datasets não
  mapeados são **negados**, não permitidos.

  > Esta regra existe porque o inverso já aconteceu. `api-auth.ts:153-159`
  > documenta a regressão: *"Antes o acesso era CONCEDIDO para datasets órfãos,
  > permitindo a um usuário autenticado ler dados de qualquer dataset não
  > mapeado"*. Fail-open por omissão é o modo de falha característico deste
  > produto — vigie-o.

- **Conjunto vazio nunca é subconjunto vacuamente.** `isSubset([], x)` é `true`
  em teoria dos conjuntos e **errado** como decisão de acesso: um usuário sem
  nenhum tenant passaria por qualquer verificação de escopo. Todo uso de
  `isSubset` para autorização exige antes `footprint.length > 0`.

- **Escopo de cache inclui o tenant.** Chave de cache sem `clientId` vaza entre
  clientes. Exceção única e explícita: agregados de mercado, que são
  intencionalmente cross-tenant — e nesse caso vale a regra do piso abaixo.

- **Agregado cross-tenant exige piso de participantes.** Estatística que cruza
  carteiras só é divulgável a partir de `MIN_BENCHMARK_CLIENTS` (3). Com um
  participante o "mercado" é a própria carteira do leitor; com dois, cada um
  deduz o outro a partir da média.

- **Sub-delegação não amplia escopo.** Um `clientAdmin` só concede o que ele
  próprio tem. Ao editar usuário compartilhado com tenant fora do seu escopo, as
  entradas de fora são **preservadas intactas** — nunca alteradas nem removidas.

- **Fail-closed em toda borda.** Falta de mapeamento, exceção na verificação,
  documento ausente: tudo nega. Se a decisão de acesso depende de um `catch`,
  o `catch` nega.

## Checklist (toda rota nova sob `app/api/`)

- [ ] Chama `verifyAuthToken` como primeira linha — e **não** uma cópia local.
- [ ] Se toca dado de cliente: `verifyClientAccess` ou `verifyDatasetAccess`.
- [ ] Se serve conteúdo de página: `verifyRouteAccess`.
- [ ] Se provisiona ou altera permissão: `getProvisionScope` / `verifyCanProvision`.
- [ ] `clientId` do corpo é validado contra o conjunto do usuário, não confiado.
- [ ] Nenhum `isSubset` de autorização sem checar conjunto vazio antes.
- [ ] Chave de cache carrega `clientId`.
- [ ] O caminho de erro nega.

## Anti-patterns

- `const clientId = body.clientId` seguido de query — sem cross-check.
- Copiar o verificador de auth para o arquivo da rota. Já custou 8 divergências
  e uma falha de autenticação em produção; use o canônico.
- Allowlist manual como gate de segurança sem definir o comportamento do que
  está fora dela. Se a omissão libera, não é gate — é sugestão.
- Bypass de autenticação condicionado a ambiente sem que a condição seja
  impossível em produção.

## Fronteira com outras convenções

`rules/security` cobre validação de entrada, segredos e headers.
`contracts/firebase-firestore` cobre modelagem e rules. Este documento cobre
**quem pode ver o dado de quem** — e prevalece sobre o modelo `tenantId` descrito
naqueles dois, que não é o deste produto.
