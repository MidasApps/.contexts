---
id: 0018
title: Tenancy por-usuário como conjunto (clientIds[]) + provisionamento self-service e papel clientAdmin
status: Proposed
date: 2026-07-21
deciders: [arquitetura]
consulted: [seguranca]
informed: [time-ai, time-data]
tags: [seguranca, multi-tenancy, rbac, provisionamento, firestore, rules]
supersedes: []
related: [0006, 0009]
---

# ADR-0018 — Tenancy por-usuário como conjunto (clientIds[]) + provisionamento self-service e papel clientAdmin

## Status

`Proposed` — desde 2026-07-21.

Histórico:
- 2026-07-21 — proposta (deriva do achado a4-cliente-permissoes-12, DoD-1 #6).

## Contexto

O achado `a4-cliente-permissoes-12` (`docs/auditoria/2026-07-21-registro-achados.md:1438-1456`,
severidade alta) documenta que **não há fluxo no app** para criar a credencial de um usuário
externo nem setar o claim de tenant: o onboarding exige console Firebase + `scripts/grant-claims.ts`
manual. Isso bloqueia DoD-1 #6.

Três forças adicionais entram em jogo:
1. O claim de tenant é hoje **singular** (`token.clientId`), consumido apenas pelas Firestore
   rules (`firestore.rules`) via `tenantMatches()` e escrito só por `scripts/grant-claims.ts`.
   Um usuário externo pode legitimamente acessar 2+ clientes — o singular não cobre.
2. Só o admin global `@askliquid.com` (`isAdminEmail`, `src/shared/lib/runtime-config.ts:32-35`)
   pode provisionar. O produto precisa de um "admin do cliente" que provisione usuários do seu
   próprio tenant sem virar admin global.
3. Não há e-mail transacional no repo — a entrega da credencial precisa de um mecanismo manual
   (`generatePasswordResetLink`).

Restrições: ADR-0006 (§1 `clientId` server-bound, cross-check, nunca confiado do request; §8
fail-closed), ADR-0009 (isolamento por tenant de `sqlCatalog`/`embeddingsSql`), ADR-0013
(Firestore como storage). Runtime Next.js 16 App Router, Firebase Admin SDK.

## Decisão

Adotamos **tenancy por-usuário como conjunto**, **provisionamento self-service (Abordagem A)**
e o papel **`clientAdmin`**:

1. **Claim `clientIds: string[]`** — projeção **read-only** do doc `users/{id}.clientAccess`
   (`clientIds = clientAccess.map(ca => ca.clientId)`), re-emitida na mesma chamada que edita
   `clientAccess`. O doc permanece a fonte de verdade (consumido pela camada de API); o claim
   serve **exclusivamente** às Firestore rules. As rules aceitam o conjunto via helper
   `tenantAllowed(cid)`, mantendo compat com o `clientId` singular legado e uma guarda
   `is list` que preserva fail-closed.
2. **`POST /api/users` provisiona a credencial numa ação** (Admin SDK): resolve a conta Auth de
   forma idempotente (`getUserByEmail`→`createUser` sem senha), aplica `setCustomUserClaims`
   com `clientIds`, grava o doc e devolve um `resetLink` one-shot (`generatePasswordResetLink`)
   só na criação de conta email/senha. Ordem: Auth → claim → doc, abortando antes do doc se o
   claim falhar (doc nunca fica "à frente" do claim).
3. **Papel `clientAdmin`** — campo `users/{id}.adminClientIds: string[]`, verificado 100%
   server-side (fora do token, ADR-0006 §1). Um `clientAdmin` provisiona/edita/lista/exclui
   apenas usuários cujo escopo ⊆ `adminClientIds`, nunca cria admin global, nunca sub-delega
   fora do próprio escopo, e edições cross-tenant preservam entradas fora do escopo (merge por
   tenant).
4. O doc continua fonte de verdade; o claim é derivado.

Detalhes de implementação em `docs/superpowers/plans/2026-07-21-a4-12-provisionamento.md`
(specs em `docs/superpowers/specs/2026-07-21-a4-12-provisionamento-design.md`).

## Consequências

### Positivas
- Onboarding de cliente externo deixa de exigir console Firebase + script manual (fecha a4-12).
- Multi-cliente por usuário passa a ser suportado sem afrouxar isolamento.
- `clientAdmin` distribui a carga de provisionamento sem conceder admin global.

### Negativas / Trade-offs
- O claim `clientIds` só atualiza no refresh do token (≤1h); o usuário re-loga para efeito imediato.
- Mantém dois formatos de claim (singular legado + conjunto) até o backfill depreciar o singular.
- Conta Auth órfã (sem doc) é possível se o write do doc falhar; é inofensiva (fail-closed na API).

### Neutras
- `scripts/grant-claims.ts` passa a escrever `clientIds`; backfill one-time re-emite claims.

## Alternativas consideradas

### Alternativa A — Derivar tenants na rule via `get(users/...)`
**Pros**: sem claim. **Cons**: doc indexado por slug de e-mail, `clientAccess` é array de maps,
`get()` custa leitura e acopla coleções server-managed ao doc de usuário. **Rejeitada**: frágil e cara.

### Alternativa B — `role`/`clientAdmin` como claim no token
**Pros**: rule poderia distinguir clientAdmin. **Cons**: depende do refresh de 1h e amplia
superfície do token; nenhum consumo de rule precisa disso hoje. **Rejeitada**: gate server-side é suficiente.

### Alternativa C — Status quo (script manual)
**Por que rejeitada**: bloqueia DoD-1 #6; sem multi-cliente; sem admin por-tenant.

## Relação com ADR-0006 / ADR-0009
Esta ADR **refina** ADR-0006 (§1 origem do `clientId`: singular → conjunto; §8 fail-closed →
guarda `is list`) e é **transparente** a ADR-0009 (isolamento por tenant de `sqlCatalog`/
`embeddingsSql` permanece; `tenantMatches()`→`tenantAllowed()` só passa a aceitar um conjunto).
Usa `related`, **não** `supersedes` — o template trata `supersedes` como substituição total, o
que invalidaria indevidamente todo o restante do ADR-0006 (RAG, memory, BQML, PII, gate adversarial).

## Implementação
- **Plano**: `docs/superpowers/plans/2026-07-21-a4-12-provisionamento.md`
- **Spec/design**: `docs/superpowers/specs/2026-07-21-a4-12-provisionamento-design.md`
- **Código**: `firestore.rules`, `app/api/users/route.ts`, `src/shared/lib/api-auth.ts`,
  `src/shared/lib/permissions/authorize.ts`, `src/shared/lib/firebase/admin.ts`,
  `src/features/admin/ui/UserForm.tsx`, `scripts/grant-claims.ts`,
  `scripts/backfill-client-ids-claim.ts`.

## Referências
- ADR-0006 `adrs/decisions/0006-multi-tenancy-strict-isolation.md`
- ADR-0009 `adrs/decisions/0009-sql-reuse-hierarchy-catalog-recall-fresh.md`
- ADR-0013 `adrs/decisions/0013-firestore-storage-config-metadata.md`
