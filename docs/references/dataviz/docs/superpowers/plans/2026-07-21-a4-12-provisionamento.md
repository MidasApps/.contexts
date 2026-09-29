# Provisionamento de usuário externo (a4-12) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que a Admin UI provisione a credencial completa de um usuário externo (conta Firebase Auth + custom claim + doc Firestore) numa única ação, com suporte a multi-cliente (`clientIds[]`) e a um novo papel `clientAdmin` (admin por-tenant), fechando o achado a4-12 / DoD-1 #6.

**Architecture:** Abordagem A (design §0.1): `POST /api/users` resolve a conta Auth de forma idempotente (`getUserByEmail`→`createUser`), emite o claim `clientIds` como **projeção read-only** de `clientAccess` (doc é a fonte de verdade, §2.4), grava o doc e devolve um `resetLink` one-shot. As Firestore rules passam a aceitar o **conjunto** `clientIds` (com back-compat para o `clientId` singular legado). O RBAC ganha o papel `clientAdmin` (`users.adminClientIds`), verificado 100% server-side (fora do token, ADR-0006 §1), que provisiona apenas usuários do(s) seu(s) tenant(s) sem escalonar.

**Tech Stack:** Next.js 16 App Router (route handlers em Node runtime), Firebase Admin SDK (`firebase-admin/auth`, `firebase-admin/firestore`), Firestore security rules v2, Zod (validação de id), Vitest 4 + Testing Library (happy-dom), tsx (scripts). Sem novas dependências de runtime.

## Global Constraints

Todo task herda implicitamente estas regras (valores copiados verbatim das premissas do design + repo):

- **Package manager:** `pnpm` (v10.32.1) — nunca `npm`/`yarn`.
- **Rodar 1 arquivo de teste:** `pnpm vitest run <caminho-do-arquivo>` (NÃO `pnpm test`, que roda a suíte inteira e infla flakiness).
- **Fail-closed é lei (ADR-0006).** Nenhuma rule, gate ou merge pode ampliar acesso. Toda ausência de dado/claim/doc → **negar**.
- **O doc `users/{id}.clientAccess` é a fonte de verdade; o claim `clientIds` é derivação** (`clientAccess.map(ca => ca.clientId)`), re-emitida na mesma chamada que edita `clientAccess`. Nunca escreva o claim divergindo do doc.
- **`POST /api/users` é o único writer de `clientAccess` + claim** (design §8.7). Qualquer outro writer (scripts) deve re-emitir o claim.
- **Nunca** `git add` de `secrets/`, `.env*`, `docker*`, `.claude/`, ou credenciais. Adicione só os arquivos do task.
- **Um commit por task**, mensagem em PT-BR no padrão `tipo(escopo): resumo (a4-12 Tn)`, terminando com o trailer:
  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  ```
- **Não rodar** seed / `bq:*` / `firebase deploy` / `pnpm dev` — deploy de rules e execução de scripts (T5/T6) são do **usuário**, em ambiente com credenciais. O plano nunca executa esses passos.
- **Runtime das rotas:** os testes de rota usam `/* @vitest-environment node */` no topo do arquivo (padrão de `app/api/clients/__tests__/route.test.ts`).
- **Tasks ⚠ (T1, T3, T7)** ampliam acesso se erradas → TDD adversarial obrigatório (o teste "red" que prova a **negação** vem ANTES do green) + revisão humana explícita antes do merge.

---

## File Structure

Mapa do que cada task cria (C) ou modifica (M):

| Arquivo | Task | Responsabilidade |
|---|---|---|
| `adrs/decisions/0018-tenancy-por-usuario-conjunto-clientids.md` | T0 (C) | ADR nova: `clientIds[]`, provisionamento Abordagem A, papel `clientAdmin` |
| `adrs/README.md` | T0 (M) | Registrar 0018 no índice |
| `firestore.rules` | T1 (M) | Helper `tenantAllowed(cid)` (back-compat singular + guarda `is list`) nos 6 sites |
| `src/shared/lib/firebase/admin.ts` | T2 (M) | Exportar `getAdminAuth()` (Admin SDK Auth server-side) |
| `app/api/users/route.ts` | T2 (M), T3 (M) | T2: create idempotente + claim + resetLink. T3: gate `verifyCanProvision`, merge por tenant, escopo GET/DELETE |
| `app/api/users/__tests__/route.test.ts` | T2 (C), T3 (M) | Testes de integração da rota |
| `app/api/users/__tests__/route-adversarial.test.ts` | T7 (C) | Suíte adversarial end-to-end (V1–V6) com helpers reais |
| `src/shared/lib/permissions/authorize.ts` | T3 (M) | Helpers puros `isSubset`, `mergeClientAccessByScope`, `mergeAdminClientIdsByScope` |
| `src/shared/lib/permissions/authorize.test.ts` | T3 (M) | Testes dos helpers puros |
| `src/shared/lib/api-auth.ts` | T3 (M) | `getProvisionScope`, `verifyCanProvision` (espelham `verifyClientAccess`) |
| `src/shared/lib/api-auth.provision.test.ts` | T3 (C) | Testes adversariais de `verifyCanProvision`/`getProvisionScope` |
| `src/features/admin/model/types.ts` | T4 (M) | `adminClientIds?` em `UserDoc`/`AppUser`; tipos `SaveUserInput`/`SaveUserResult` |
| `src/features/admin/model/useAdminUsers.ts` | T4 (M) | `save` repassa `adminClientIds`/flags e **retorna** o body (resetLink) |
| `src/features/admin/ui/UserForm.tsx` | T4 (M) | Checkbox credencial, exibir resetLink one-shot, campo `adminClientIds` só p/ admin global |
| `src/features/admin/ui/UsersTab.tsx` | T4 (M) | Propagar retorno de `save` até o `UserForm` |
| `src/features/admin/ui/__tests__/UserForm.test.tsx` | T4 (C) | Render/UX do form |
| `scripts/lib/grant-claims-args.ts` | T5 (C) | Parse puro de args + merge de claims (`--clientIds`, alias `--clientId`) |
| `scripts/lib/grant-claims-args.test.ts` | T5 (C) | Testes do parser/merge |
| `scripts/grant-claims.ts` | T5 (M) | Usar os helpers puros; escrever claim `clientIds` |
| `scripts/lib/backfill-plan.ts` | T6 (C) | `buildBackfillPlan` puro |
| `scripts/lib/backfill-plan.test.ts` | T6 (C) | Testes do plano de backfill |
| `scripts/backfill-client-ids-claim.ts` | T6 (C) | Script one-time (dry-run default, `--apply`) |

**Tipos/nomes canônicos (consistência entre tasks):**
- Claim (array, no JWT): `clientIds: string[]`.
- Doc field (papel): `adminClientIds: string[]`.
- admin.ts: `getAdminAuth(): import('firebase-admin/auth').Auth`.
- authorize.ts: `isSubset(candidate, universe)`, `mergeClientAccessByScope(existing, incoming, scope)`, `mergeAdminClientIdsByScope(existing, incoming, scope)`.
- api-auth.ts: `getProvisionScope(callerEmail)`, `verifyCanProvision(callerEmail, target)`.
- rules: `tenantAllowed(cid)`.
- body novo: `adminClientIds?: string[]`, `provisionCredential?: boolean` (default true), `generatePasswordLink?: boolean` (default true).

**Sequência crítica:** T0 → T1 → T2 → T3 → T4; T5/T6 após T1; T7 fecha validando T1+T3.

---

### Task T0: ADR-0018 (registro da decisão)

**Files:**
- Create: `adrs/decisions/0018-tenancy-por-usuario-conjunto-clientids.md`
- Modify: `adrs/README.md:107` (índice de ADRs)

**Interfaces:**
- Consumes: nada (documento).
- Produces: referência estável `ADR-0018` citada pelas outras tasks e pelo header das rules/route.

**Risco:** baixo. Testável por: revisão humana.

- [ ] **Step 1: Criar a ADR**

Criar `adrs/decisions/0018-tenancy-por-usuario-conjunto-clientids.md` com o conteúdo (formato Nygard PT-BR do `adrs/_template.md`; `related: [0006, 0009]`, **não** `supersedes` — design §6):

```markdown
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
```

- [ ] **Step 2: Registrar no índice**

Em `adrs/README.md`, adicionar a linha após a de 0017 (`:107`):

```markdown
| [0018](decisions/0018-tenancy-por-usuario-conjunto-clientids.md) | Tenancy por-usuário como conjunto (clientIds[]) + provisionamento self-service e papel clientAdmin | Proposed | seguranca, multi-tenancy, rbac, provisionamento, firestore, rules |
```

- [ ] **Step 3: Verificar (lint de doc)**

Run: `pnpm lint`
Expected: PASS (markdown não é lintado por ESLint; garante que nenhum arquivo TS quebrou). Conferir manualmente que o arquivo abre no editor sem YAML frontmatter malformado.

- [ ] **Step 4: Commit**

```bash
git add adrs/decisions/0018-tenancy-por-usuario-conjunto-clientids.md adrs/README.md
git commit -m "docs(adr): ADR-0018 tenancy por-usuário como conjunto + clientAdmin (a4-12 T0)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task T1 ⚠: Rules multi-cliente (`tenantAllowed`)

**Files:**
- Modify: `firestore.rules` (helper em `:25-29`; sites em `:41-47`, `:95`, `:99-102`, `:109`, `:113`, `:117`, `:125`, `:129`)

**Interfaces:**
- Consumes: claim `clientIds: string[]` (produzido por T2/T5/T6) e `clientId` singular legado.
- Produces: helper `tenantAllowed(cid)` usado por 6 sites (design §1.6).

**Risco:** ⚠ **alto** (uma rule mais permissiva vaza dados cross-tenant). **Testável por:** verificação manual estruturada (o repo **não** tem harness de rules — `package.json` não declara `@firebase/rules-unit-testing` nem `firebase-tools`; adicionar o emulador é custo desproporcional para este task, ver Step 5). TDD adversarial aqui é o **checklist de negação** (Step 4) revisado por humano.

> **Decisão sobre teste de rules (honesta):** não existe teste Vitest que valide `firestore.rules`
> — Vitest não interpreta a linguagem de rules. A via de **menor risco** é verificação por leitura
> (checklist §4) + validação de sintaxe pelo usuário via `firebase deploy --only firestore:rules`
> (o `firebase.json` já aponta `firestore.rules` para o database `liquid-play-dataviz`). NÃO
> fabricamos um teste TS que "simula" a rule — isso validaria uma cópia, não o artefato. O harness
> de emulador fica como follow-up opcional (Step 5), fora do escopo deste task de segurança.

- [ ] **Step 1: Ler o estado atual e confirmar os 6 sites**

Reler `firestore.rules:25-29` (helper `tenantMatches`) e os sites `:41-47`, `:95`, `:99-102`,
`:109`, `:113`, `:117`, `:125`, `:129`. Confirmar que `tenantMatches()` usa `resource.data.clientId`
sem argumento e que as subcoleções usam `request.auth.token.clientId == clientId` (path var).

- [ ] **Step 2: Substituir o helper**

Trocar o bloco `firestore.rules:25-29`:

```
    function tenantMatches() {
      return request.auth != null
        && resource.data.clientId is string
        && request.auth.token.clientId == resource.data.clientId;
    }
```

por (helper novo com argumento, back-compat singular + guarda `is list`):

```
    // tenantAllowed(cid): true se o principal pertence ao tenant `cid`.
    // Aceita o claim conjunto `clientIds` (novo, ADR-0018) OU o `clientId`
    // singular legado. A guarda `is list` mantém fail-closed: sem o claim
    // novo, a condição do lado direito é falsa e cai no singular; sem nenhum,
    // nega (ADR-0006 §8). Nenhum caminho AMPLIA acesso.
    function tenantAllowed(cid) {
      return request.auth != null && cid is string && (
        request.auth.token.clientId == cid
        || (request.auth.token.clientIds is list
            && cid in request.auth.token.clientIds)
      );
    }
```

- [ ] **Step 3: Aplicar `tenantAllowed` nos 6 sites**

3a. Subcoleções de cliente — `firestore.rules:39-49`. Substituir o bloco:

```
      match /groups/{groupId} {
        allow read: if request.auth != null
          && (isAdminEmail() || request.auth.token.clientId == clientId);
        allow write: if isAdminEmail() || request.auth.token.clientId == clientId;

        match /reports/{reportId} {
          allow read: if request.auth != null
            && (isAdminEmail() || request.auth.token.clientId == clientId);
          allow write: if isAdminEmail() || request.auth.token.clientId == clientId;
        }
      }
```

por:

```
      match /groups/{groupId} {
        allow read: if request.auth != null
          && (isAdminEmail() || tenantAllowed(clientId));
        allow write: if isAdminEmail() || tenantAllowed(clientId);

        match /reports/{reportId} {
          allow read: if request.auth != null
            && (isAdminEmail() || tenantAllowed(clientId));
          allow write: if isAdminEmail() || tenantAllowed(clientId);
        }
      }
```

3b. `workingMemory/{threadId}` read — `firestore.rules:95`. Trocar:

```
      allow read: if isAdminEmail() || tenantMatches();
```

por:

```
      allow read: if isAdminEmail() || tenantAllowed(resource.data.clientId);
```

3c. `workingMemory/{threadId}/messages` read — `firestore.rules:99-102`. Trocar:

```
        allow read: if isAdminEmail()
          || (request.auth != null
              && resource.data.clientId is string
              && request.auth.token.clientId == resource.data.clientId);
```

por:

```
        allow read: if isAdminEmail() || tenantAllowed(resource.data.clientId);
```

3d. `embeddingsDocs` (`:109`), `embeddingsSql` (`:113`), `embeddingsBlocks` (`:117`),
`sqlCatalog` (`:125`), `sqlCatalogEvents` (`:129`) — em cada um, trocar
`allow read: if isAdminEmail() || tenantMatches();` por
`allow read: if isAdminEmail() || tenantAllowed(resource.data.clientId);`.

Confirmar que **nenhuma** ocorrência de `tenantMatches()` resta (`grep -n "tenantMatches" firestore.rules` deve retornar vazio) e que `allow write: if false;` das coleções server-managed permanece intacto.

- [ ] **Step 4: Verificação manual estruturada (checklist adversarial §4)**

Sem harness automatizado, o revisor humano confirma por leitura que cada critério de aceite §4 vale:

- [ ] Usuário com `clientIds:['A','B']` → lê `clients/A/groups/*` e `clients/B/groups/*` (o `in` casa), negado em `clients/C/*` (`C` não está na lista, singular ausente → deny).
- [ ] Usuário legado só com `clientId:'A'` → lê `clients/A/*` (ramo singular do `||`), sem regressão.
- [ ] Usuário sem nenhum claim de tenant → negado em TODA coleção tenant-bound: `clientIds is list` é falso e `clientId == cid` é falso → `tenantAllowed` retorna false (fail-closed), inclusive quando `clientIds` está ausente.
- [ ] `allow write: if false;` permanece em `workingMemory`, `embeddings*`, `sqlCatalog*`.
- [ ] Nenhuma condição ficou mais permissiva que a original (só o ramo `clientIds in list` foi ADICIONADO a um `||` cuja outra metade é a condição legada).

Registrar o resultado do checklist no corpo do PR (evidência para revisão humana — task ⚠).

- [ ] **Step 5: Validação de sintaxe (manual, ambiente do usuário)**

**Executado pelo USUÁRIO** (não pelo agente; requer `firebase-tools` global + credenciais):

Run: `firebase deploy --only firestore:rules --dry-run`
Expected: compilação sem erro de sintaxe (o `firebase.json` já mapeia `firestore.rules` → database `liquid-play-dataviz`). Se `--dry-run` não for suportado na versão instalada, usar `firebase deploy --only firestore:rules` num projeto de staging.

> **Follow-up opcional (fora deste task):** para cobertura automatizada de rules seria preciso
> adicionar `@firebase/rules-unit-testing` (devDep), um script que suba o emulador Firestore
> (`firebase.json` já tem `emulators.firestore` na porta 8181, mas exige Java + `firebase-tools`
> e orquestração em CI) e um arquivo `*.rules.test.ts` que rode contra o emulador. Recomendado
> como PR dedicado, não bundle neste task de segurança (adiciona toolchain e ponto de flakiness).

- [ ] **Step 6: Commit**

```bash
git add firestore.rules
git commit -m "fix(rules): tenantAllowed aceita clientIds[] com back-compat singular (a4-12 T1)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task T2: Route create + claim (Abordagem A)

**Files:**
- Modify: `src/shared/lib/firebase/admin.ts:1-58` (exportar `getAdminAuth`)
- Modify: `app/api/users/route.ts:39-118` (POST)
- Create: `app/api/users/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `getDb()` e (novo) `getAdminAuth()` de `@/shared/lib/firebase/admin`; `verifyAuthToken`; `isAdminEmail`; `UserDocId`.
- Produces:
  - `getAdminAuth(): import('firebase-admin/auth').Auth`.
  - `POST /api/users` body estendido: `{ id, email, displayName, groups, clientAccess: {clientId, routeOverrides?}[], adminClientIds?: string[], provisionCredential?: boolean, generatePasswordLink?: boolean }`.
  - Resposta create: `{ ok: true, uid?: string, credentialCreated?: boolean, resetLink?: string }`.

**Risco:** médio. **Testável por:** teste de integração da rota (create/edit/idempotência; resetLink só em create).

- [ ] **Step 1: Exportar `getAdminAuth` em admin.ts**

Editar `src/shared/lib/firebase/admin.ts`. Adicionar o import e o helper (espelha o uso já existente de `getAuth()` em `api-auth.ts:2` e `require-admin.ts:3`):

No topo, após a linha 3 (`import { getFirestore } ...`), adicionar:

```ts
import { getAuth } from 'firebase-admin/auth';
import type { Auth } from 'firebase-admin/auth';
```

E antes do auto-init final (`ensureAdminApp();` na linha 58), adicionar:

```ts
/**
 * Retorna o Auth do Admin SDK (server-side), garantindo bootstrap do app.
 * Usado para createUser/setCustomUserClaims/generatePasswordResetLink no
 * provisionamento de credencial (Abordagem A, ADR-0018).
 */
export function getAdminAuth(): Auth {
  ensureAdminApp();
  return getAuth();
}
```

- [ ] **Step 2: Escrever o teste da rota (RED)**

Criar `app/api/users/__tests__/route.test.ts` (mirror do padrão hoisted de `app/api/clients/__tests__/route.test.ts`):

```ts
/* @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { verifyAuthTokenMock, isAdminEmailMock, dbState, authState } = vi.hoisted(() => {
  const userDocRef = {
    get: vi.fn(async () => ({ exists: false, data: () => ({}) })),
    set: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
  };
  const usersCol = {
    doc: vi.fn(() => userDocRef),
    get: vi.fn(async () => ({ docs: [] })),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  };
  // where(...).limit(...).get() → default: no duplicate email
  usersCol.get.mockResolvedValue({ empty: true, docs: [] });
  const clientsCol = { get: vi.fn(async () => ({ docs: [{ id: 'vila-rosa' }, { id: 'om' }] })) };
  const groupsCol = { get: vi.fn(async () => ({ docs: [{ id: 'analyst' }] })) };
  return {
    verifyAuthTokenMock: vi.fn(async (): Promise<string | null> => 'admin@askliquid.com'),
    isAdminEmailMock: vi.fn(() => true),
    dbState: {
      collection: vi.fn((name: string) =>
        name === 'clients' ? clientsCol : name === 'groups' ? groupsCol : usersCol,
      ),
      userDocRef,
      usersCol,
    },
    authState: {
      getUserByEmail: vi.fn(),
      createUser: vi.fn(),
      setCustomUserClaims: vi.fn(async () => undefined),
      generatePasswordResetLink: vi.fn(async () => 'https://reset.example/abc'),
    },
  };
});

vi.mock('@/shared/lib/api-auth', () => ({ verifyAuthToken: verifyAuthTokenMock }));
vi.mock('@/shared/lib/firebase/admin', () => ({
  getDb: () => dbState,
  getAdminAuth: () => authState,
}));
vi.mock('@/shared/lib/runtime-config', () => ({ isAdminEmail: isAdminEmailMock }));
vi.mock('firebase-admin/firestore', () => ({
  Timestamp: { now: () => ({ seconds: 0, nanoseconds: 0 }) },
}));

import { NextRequest } from 'next/server';
import { POST } from '../route';

function req(body: unknown): NextRequest {
  return new Request('http://localhost/api/users', {
    method: 'POST',
    headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const base = {
  id: 'novo_empresa_com',
  email: 'novo@empresa.com',
  displayName: 'Novo Usuário',
  groups: [] as string[],
  clientAccess: [{ clientId: 'vila-rosa' }],
};

describe('POST /api/users — provisionamento (Abordagem A)', () => {
  beforeEach(() => {
    verifyAuthTokenMock.mockResolvedValue('admin@askliquid.com');
    isAdminEmailMock.mockReturnValue(true);
    dbState.usersCol.get.mockResolvedValue({ empty: true, docs: [] });
    dbState.userDocRef.get.mockResolvedValue({ exists: false, data: () => ({}) });
    authState.getUserByEmail.mockReset();
    authState.createUser.mockReset();
    authState.setCustomUserClaims.mockClear();
    authState.generatePasswordResetLink.mockClear();
  });

  it('cria conta Auth quando não existe, emite claim clientIds e devolve resetLink', async () => {
    authState.getUserByEmail.mockRejectedValueOnce({ code: 'auth/user-not-found' });
    authState.createUser.mockResolvedValueOnce({ uid: 'uid-123' });

    const res = await POST(req(base));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, uid: 'uid-123', credentialCreated: true, resetLink: 'https://reset.example/abc' });
    expect(authState.createUser).toHaveBeenCalledWith({ email: 'novo@empresa.com', displayName: 'Novo Usuário' });
    expect(authState.setCustomUserClaims).toHaveBeenCalledWith('uid-123', { clientIds: ['vila-rosa'] });
    expect(dbState.userDocRef.set).toHaveBeenCalled();
  });

  it('é idempotente: conta já existe → reusa uid, não cria, sem resetLink', async () => {
    authState.getUserByEmail.mockResolvedValueOnce({ uid: 'uid-existente', customClaims: { role: 'x' } });

    const res = await POST(req(base));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, uid: 'uid-existente', credentialCreated: false });
    expect(body.resetLink).toBeUndefined();
    expect(authState.createUser).not.toHaveBeenCalled();
    // preserva claims existentes ao mesclar
    expect(authState.setCustomUserClaims).toHaveBeenCalledWith('uid-existente', { role: 'x', clientIds: ['vila-rosa'] });
  });

  it('erro auth/* inesperado no getUserByEmail → 502, não grava doc', async () => {
    authState.getUserByEmail.mockRejectedValueOnce({ code: 'auth/internal-error' });
    const res = await POST(req(base));
    expect(res.status).toBe(502);
    expect(dbState.userDocRef.set).not.toHaveBeenCalled();
  });

  it('falha ao setar claim → 500, não grava doc (doc nunca à frente do claim)', async () => {
    authState.getUserByEmail.mockResolvedValueOnce({ uid: 'uid-9' });
    authState.setCustomUserClaims.mockRejectedValueOnce(new Error('boom'));
    const res = await POST(req(base));
    expect(res.status).toBe(500);
    expect(dbState.userDocRef.set).not.toHaveBeenCalled();
  });

  it('provisionCredential:false → só grava doc, sem tocar Auth', async () => {
    const res = await POST(req({ ...base, provisionCredential: false }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(authState.getUserByEmail).not.toHaveBeenCalled();
    expect(authState.setCustomUserClaims).not.toHaveBeenCalled();
    expect(dbState.userDocRef.set).toHaveBeenCalled();
  });

  it('401 sem auth', async () => {
    verifyAuthTokenMock.mockResolvedValueOnce(null);
    const res = await POST(req(base));
    expect(res.status).toBe(401);
  });

  it('403 para não-admin', async () => {
    isAdminEmailMock.mockReturnValueOnce(false);
    const res = await POST(req(base));
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 3: Rodar o teste (verificar RED)**

Run: `pnpm vitest run app/api/users/__tests__/route.test.ts`
Expected: FAIL — a rota atual não chama `getAdminAuth`, não devolve `uid`/`resetLink`, não respeita `provisionCredential`.

- [ ] **Step 4: Implementar o POST (GREEN)**

Em `app/api/users/route.ts`: adicionar `getAdminAuth` ao import de admin (linha 3):

```ts
import { getDb, getAdminAuth } from '@/shared/lib/firebase/admin';
```

Substituir toda a função `POST` (`route.ts:39-118`) por:

```ts
export async function POST(req: NextRequest) {
  const email = await verifyAuthToken(req);
  if (!email) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }
  if (!isAdminEmail(email)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  try {
    const body = await req.json() as {
      id: string;
      email: string;
      displayName: string;
      groups: string[];
      clientAccess: { clientId: string; routeOverrides?: string[] | null }[];
      adminClientIds?: string[];
      provisionCredential?: boolean;
      generatePasswordLink?: boolean;
    };

    if (!body.email?.trim()) {
      return NextResponse.json({ error: 'Email é obrigatório.' }, { status: 400 });
    }
    if (!body.displayName?.trim()) {
      return NextResponse.json({ error: 'Nome é obrigatório.' }, { status: 400 });
    }
    const idResult = UserDocId.safeParse(body.id);
    if (!idResult.success) {
      return NextResponse.json({ error: 'ID de usuário inválido.' }, { status: 400 });
    }

    const db = getDb();

    const emailSnap = await db.collection('users').where('email', '==', body.email).limit(1).get();
    if (!emailSnap.empty && emailSnap.docs[0].id !== body.id) {
      return NextResponse.json({ error: 'Já existe um usuário com este email.' }, { status: 400 });
    }

    if (body.clientAccess?.length > 0) {
      const clientsSnap = await db.collection('clients').get();
      const validClientIds = new Set(clientsSnap.docs.map((d) => d.id));
      for (const ca of body.clientAccess) {
        if (!validClientIds.has(ca.clientId)) {
          return NextResponse.json({ error: `Cliente referenciado não existe: ${ca.clientId}` }, { status: 400 });
        }
      }
    }

    if (body.groups?.length > 0) {
      const groupsSnap = await db.collection('groups').get();
      const validGroupIds = new Set(groupsSnap.docs.map((d) => d.id));
      for (const groupId of body.groups) {
        if (!validGroupIds.has(groupId)) {
          return NextResponse.json({ error: `Grupo referenciado não existe: ${groupId}` }, { status: 400 });
        }
      }
    }

    // ── Abordagem A: provisionamento de credencial (Auth → claim → doc) ──────────
    const provisionCredential = body.provisionCredential !== false; // default true
    let uid: string | undefined;
    let credentialCreated = false;
    let resetLink: string | undefined;

    if (provisionCredential) {
      const auth = getAdminAuth();
      let existingClaims: Record<string, unknown> = {};
      try {
        const existingUser = await auth.getUserByEmail(body.email);
        uid = existingUser.uid;
        existingClaims = (existingUser.customClaims as Record<string, unknown> | undefined) ?? {};
      } catch (e) {
        if ((e as { code?: string }).code === 'auth/user-not-found') {
          const created = await auth.createUser({ email: body.email, displayName: body.displayName });
          uid = created.uid;
          credentialCreated = true;
        } else {
          return NextResponse.json({ error: 'Falha ao resolver conta de autenticação.' }, { status: 502 });
        }
      }

      // Claim clientIds = projeção read-only de clientAccess (fonte única = doc). §2.4
      const clientIds = (body.clientAccess ?? []).map((ca) => ca.clientId);
      try {
        await auth.setCustomUserClaims(uid!, { ...existingClaims, clientIds });
      } catch {
        // Aborta ANTES de gravar o doc — doc nunca fica "à frente" do claim (§5 V4).
        return NextResponse.json({ error: 'Falha ao aplicar permissões (claim).' }, { status: 500 });
      }

      if (credentialCreated && body.generatePasswordLink !== false) {
        try {
          resetLink = await auth.generatePasswordResetLink(body.email);
        } catch {
          resetLink = undefined; // link é opcional; nunca bloqueia o provisionamento
        }
      }
    }

    const ref = db.collection('users').doc(body.id);
    const existing = await ref.get();
    const now = Timestamp.now();

    await ref.set({
      email: body.email,
      displayName: body.displayName,
      groups: body.groups ?? [],
      clientAccess: body.clientAccess ?? [],
      ...(body.adminClientIds ? { adminClientIds: body.adminClientIds } : {}),
      updatedAt: now,
      ...(existing.exists ? {} : { createdAt: now }),
    }, { merge: true });

    if (!provisionCredential) {
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: true, uid, credentialCreated, ...(resetLink ? { resetLink } : {}) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao salvar usuário';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 5: Rodar o teste (verificar GREEN)**

Run: `pnpm vitest run app/api/users/__tests__/route.test.ts`
Expected: PASS (todos os casos).

- [ ] **Step 6: Commit**

```bash
git add src/shared/lib/firebase/admin.ts app/api/users/route.ts app/api/users/__tests__/route.test.ts
git commit -m "feat(users): provisiona credencial+claim clientIds idempotente no POST (a4-12 T2)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task T3 ⚠: RBAC `clientAdmin` (gate + merge por tenant)

**Files:**
- Modify: `src/shared/lib/permissions/authorize.ts:1-49` (helpers puros)
- Modify: `src/shared/lib/permissions/authorize.test.ts` (testes dos helpers)
- Modify: `src/shared/lib/api-auth.ts` (novos `getProvisionScope`, `verifyCanProvision`)
- Create: `src/shared/lib/api-auth.provision.test.ts`
- Modify: `app/api/users/route.ts` (gate POST → `verifyCanProvision`; merge por tenant; escopo GET/DELETE)
- Modify: `app/api/users/__tests__/route.test.ts` (estender mock de api-auth)

**Interfaces:**
- Consumes: `isSubset`/`mergeClientAccessByScope`/`mergeAdminClientIdsByScope` (authorize.ts); `getDb`; `isAdminEmail`.
- Produces:
  - `isSubset(candidate: string[], universe: string[]): boolean`
  - `mergeClientAccessByScope(existing: ClientAccessEntry[], incoming: ClientAccessEntry[], scope: string[]): ClientAccessEntry[]`
  - `mergeAdminClientIdsByScope(existing: string[], incoming: string[], scope: string[]): string[]`
  - `getProvisionScope(callerEmail: string): Promise<{ allowed: boolean; global: boolean; adminClientIds: string[]; error?: string; status?: number }>`
  - `verifyCanProvision(callerEmail: string, target: { email: string; clientAccess: { clientId: string }[]; adminClientIds?: string[] }): Promise<{ allowed: boolean; global: boolean; adminClientIds: string[]; error?: string; status?: number }>`

**Risco:** ⚠ **alto** (gate de escalonamento de privilégio). **Testável por:** teste do gate (escopo, bloqueio domínio admin, preserve cross-tenant) — TDD adversarial (RED prova a negação antes do green) + revisão humana.

- [ ] **Step 1: Escrever os testes dos helpers puros (RED)**

Adicionar ao final de `src/shared/lib/permissions/authorize.test.ts`. Primeiro atualizar o import do topo (`:2-7`) para incluir os novos nomes:

```ts
import {
  computeBaseRoutes,
  canAccessRoute,
  isSubset,
  mergeClientAccessByScope,
  mergeAdminClientIdsByScope,
  type PermissionGroup,
  type UserAccessDoc,
  type ClientAccessEntry,
} from './authorize';
```

E anexar os blocos:

```ts
describe('isSubset', () => {
  it('true quando todos os candidatos estão no universo', () => {
    expect(isSubset(['a', 'b'], ['a', 'b', 'c'])).toBe(true);
  });
  it('false quando algum candidato está fora', () => {
    expect(isSubset(['a', 'x'], ['a', 'b'])).toBe(false);
  });
  it('true para candidato vazio (fail-closed não se aplica a conjunto vazio)', () => {
    expect(isSubset([], ['a'])).toBe(true);
  });
});

describe('mergeClientAccessByScope', () => {
  const scope = ['vila-rosa'];
  const existing: ClientAccessEntry[] = [
    { clientId: 'vila-rosa', routeOverrides: null },
    { clientId: 'om', routeOverrides: ['/dashboard'] },
  ];

  it('preserva entradas FORA do escopo e substitui as DENTRO', () => {
    const incoming: ClientAccessEntry[] = [{ clientId: 'vila-rosa', routeOverrides: ['/pdd'] }];
    const out = mergeClientAccessByScope(existing, incoming, scope);
    expect(out).toContainEqual({ clientId: 'om', routeOverrides: ['/dashboard'] }); // preservada byte-idêntica
    expect(out).toContainEqual({ clientId: 'vila-rosa', routeOverrides: ['/pdd'] }); // atualizada
    expect(out.some((c) => c.clientId === 'vila-rosa' && c.routeOverrides === null)).toBe(false);
  });

  it('ignora entradas incoming FORA do escopo (não concede cross-tenant)', () => {
    const incoming: ClientAccessEntry[] = [
      { clientId: 'vila-rosa', routeOverrides: null },
      { clientId: 'brz', routeOverrides: null }, // fora do escopo → deve ser descartada
    ];
    const out = mergeClientAccessByScope(existing, incoming, scope);
    expect(out.some((c) => c.clientId === 'brz')).toBe(false);
  });

  it('remover uma entrada DENTRO do escopo é permitido; FORA é preservada', () => {
    const incoming: ClientAccessEntry[] = []; // clientAdmin tenta remover tudo
    const out = mergeClientAccessByScope(existing, incoming, scope);
    expect(out).toEqual([{ clientId: 'om', routeOverrides: ['/dashboard'] }]); // om (fora) intacto; vila-rosa removida
  });
});

describe('mergeAdminClientIdsByScope', () => {
  it('preserva adminClientIds fora do escopo e aplica os de dentro', () => {
    const out = mergeAdminClientIdsByScope(['om'], ['vila-rosa'], ['vila-rosa']);
    expect(out.sort()).toEqual(['om', 'vila-rosa']);
  });
  it('descarta sub-delegação fora do escopo', () => {
    const out = mergeAdminClientIdsByScope([], ['brz'], ['vila-rosa']);
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar (verificar RED)**

Run: `pnpm vitest run src/shared/lib/permissions/authorize.test.ts`
Expected: FAIL — `isSubset`/`mergeClientAccessByScope`/`mergeAdminClientIdsByScope` não existem.

- [ ] **Step 3: Implementar os helpers puros (GREEN)**

Anexar ao final de `src/shared/lib/permissions/authorize.ts`:

```ts
/** true se todo item de `candidate` pertence a `universe`. Conjunto vazio é subconjunto de qualquer um. */
export function isSubset(candidate: string[], universe: string[]): boolean {
  const set = new Set(universe);
  return candidate.every((c) => set.has(c));
}

/**
 * Merge por tenant de clientAccess para um caller com escopo restrito (§3.3):
 * entradas de tenants FORA de `scope` no doc existente são preservadas intactas;
 * dentro de `scope`, o incoming substitui (incluindo remoção). Entradas incoming
 * de tenants fora de `scope` são descartadas (não concede cross-tenant).
 */
export function mergeClientAccessByScope(
  existing: ClientAccessEntry[],
  incoming: ClientAccessEntry[],
  scope: string[],
): ClientAccessEntry[] {
  const inScope = new Set(scope);
  const preserved = existing.filter((ca) => !inScope.has(ca.clientId));
  const mutable = incoming.filter((ca) => inScope.has(ca.clientId));
  return [...preserved, ...mutable];
}

/** Idem para adminClientIds (sub-delegação). Preserva fora do escopo, aplica dentro, dedup. */
export function mergeAdminClientIdsByScope(
  existing: string[],
  incoming: string[],
  scope: string[],
): string[] {
  const inScope = new Set(scope);
  const preserved = existing.filter((id) => !inScope.has(id));
  const mutable = incoming.filter((id) => inScope.has(id));
  return [...new Set([...preserved, ...mutable])];
}
```

- [ ] **Step 4: Rodar (verificar GREEN)**

Run: `pnpm vitest run src/shared/lib/permissions/authorize.test.ts`
Expected: PASS.

- [ ] **Step 5: Escrever os testes de `verifyCanProvision`/`getProvisionScope` (RED, adversarial)**

Criar `src/shared/lib/api-auth.provision.test.ts` (mirror do preâmbulo hoisted de `api-auth.test.ts`):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getDbMock = vi.fn();
const isAdminEmailMock = vi.fn();

vi.mock('firebase-admin/auth', () => ({ getAuth: vi.fn(() => ({ verifyIdToken: vi.fn() })) }));
vi.mock('@/shared/lib/firebase/admin', () => ({ getDb: (...a: unknown[]) => getDbMock(...a) }));
vi.mock('@/shared/lib/runtime-config', () => ({
  isAdminEmail: (...a: unknown[]) => isAdminEmailMock(...a),
  isDevAuthBypassEnabled: vi.fn(() => false),
  DEV_BYPASS_EMAIL: 'dev@local',
}));

import { verifyCanProvision, getProvisionScope } from './api-auth';

/** getDb() stub: users por email com adminClientIds. */
function buildDb(users: Record<string, Record<string, unknown>>) {
  return {
    collection() {
      return {
        where(_f: string, _op: string, value: string) {
          return {
            limit() {
              return {
                async get() {
                  const entry = users[value];
                  const docs = entry ? [{ id: value, data: () => entry }] : [];
                  return { empty: docs.length === 0, docs };
                },
              };
            },
          };
        },
      };
    },
  };
}

beforeEach(() => {
  getDbMock.mockReset();
  isAdminEmailMock.mockReset();
  isAdminEmailMock.mockReturnValue(false);
});

describe('getProvisionScope', () => {
  it('admin global → allowed + global, sem tocar Firestore', async () => {
    isAdminEmailMock.mockReturnValue(true);
    const s = await getProvisionScope('admin@askliquid.com');
    expect(s).toEqual({ allowed: true, global: true, adminClientIds: [] });
    expect(getDbMock).not.toHaveBeenCalled();
  });
  it('caller sem doc → 403', async () => {
    getDbMock.mockReturnValue(buildDb({}));
    const s = await getProvisionScope('ghost@empresa.com');
    expect(s).toMatchObject({ allowed: false, status: 403 });
  });
  it('caller com adminClientIds vazio → 403', async () => {
    getDbMock.mockReturnValue(buildDb({ 'c@empresa.com': { email: 'c@empresa.com', adminClientIds: [] } }));
    const s = await getProvisionScope('c@empresa.com');
    expect(s).toMatchObject({ allowed: false, status: 403 });
  });
  it('clientAdmin válido → allowed + escopo', async () => {
    getDbMock.mockReturnValue(buildDb({ 'c@empresa.com': { email: 'c@empresa.com', adminClientIds: ['vila-rosa'] } }));
    const s = await getProvisionScope('c@empresa.com');
    expect(s).toEqual({ allowed: true, global: false, adminClientIds: ['vila-rosa'] });
  });
});

describe('verifyCanProvision — barreiras (fail-closed)', () => {
  const caller = 'c@empresa.com';
  beforeEach(() => {
    getDbMock.mockReturnValue(buildDb({ [caller]: { email: caller, adminClientIds: ['vila-rosa'] } }));
  });

  it('admin global provisiona qualquer target', async () => {
    isAdminEmailMock.mockImplementation((e?: string) => e === 'admin@askliquid.com');
    const r = await verifyCanProvision('admin@askliquid.com', {
      email: 'x@empresa.com', clientAccess: [{ clientId: 'om' }, { clientId: 'brz' }],
    });
    expect(r).toEqual({ allowed: true, global: true, adminClientIds: [] });
  });

  it('clientAdmin de {vila-rosa} cria target [vila-rosa] → allowed', async () => {
    const r = await verifyCanProvision(caller, { email: 'u@empresa.com', clientAccess: [{ clientId: 'vila-rosa' }] });
    expect(r).toMatchObject({ allowed: true, global: false });
  });

  it('clientAdmin cria target [vila-rosa, om] (om fora) → 403', async () => {
    const r = await verifyCanProvision(caller, {
      email: 'u@empresa.com', clientAccess: [{ clientId: 'vila-rosa' }, { clientId: 'om' }],
    });
    expect(r).toMatchObject({ allowed: false, status: 403 });
  });

  it('clientAdmin tenta criar admin global (email @askliquid.com) → 403 [V1]', async () => {
    isAdminEmailMock.mockImplementation((e?: string) => (e ?? '').endsWith('@askliquid.com'));
    const r = await verifyCanProvision(caller, { email: 'evil@askliquid.com', clientAccess: [{ clientId: 'vila-rosa' }] });
    expect(r).toMatchObject({ allowed: false, status: 403 });
  });

  it('clientAdmin sub-delega adminClientIds fora do escopo → 403', async () => {
    const r = await verifyCanProvision(caller, {
      email: 'u@empresa.com', clientAccess: [{ clientId: 'vila-rosa' }], adminClientIds: ['om'],
    });
    expect(r).toMatchObject({ allowed: false, status: 403 });
  });
});
```

- [ ] **Step 6: Rodar (verificar RED)**

Run: `pnpm vitest run src/shared/lib/api-auth.provision.test.ts`
Expected: FAIL — `verifyCanProvision`/`getProvisionScope` não existem.

- [ ] **Step 7: Implementar `getProvisionScope`/`verifyCanProvision` (GREEN)**

Em `src/shared/lib/api-auth.ts`: no import de authorize (`:5`), adicionar `isSubset`:

```ts
import { canAccessRoute, isSubset, type PermissionGroup, type UserAccessDoc } from '@/shared/lib/permissions/authorize';
```

Anexar ao final de `src/shared/lib/api-auth.ts`:

```ts
// ─── Provisionamento (RBAC clientAdmin, ADR-0018) ─────────────────────────────

export interface ProvisionScope {
  allowed: boolean;
  global: boolean;
  adminClientIds: string[];
  error?: string;
  status?: number;
}

/**
 * Resolve o escopo de provisionamento do chamador (server-side, ADR-0006 §1):
 * admin global (isAdminEmail) → escopo total; senão lê `users/{email}.adminClientIds`.
 * Fail-closed: sem doc ou adminClientIds vazio → negado.
 */
export async function getProvisionScope(callerEmail: string): Promise<ProvisionScope> {
  if (isAdminEmail(callerEmail)) {
    return { allowed: true, global: true, adminClientIds: [] };
  }
  const db = getDb();
  const snap = await db.collection('users').where('email', '==', callerEmail).limit(1).get();
  if (snap.empty) {
    return { allowed: false, global: false, adminClientIds: [], error: 'Sem permissão para provisionar', status: 403 };
  }
  const adminClientIds: string[] = (snap.docs[0].data().adminClientIds as string[] | undefined) ?? [];
  if (adminClientIds.length === 0) {
    return { allowed: false, global: false, adminClientIds: [], error: 'Sem permissão para provisionar', status: 403 };
  }
  return { allowed: true, global: false, adminClientIds };
}

export interface ProvisionTarget {
  email: string;
  clientAccess: { clientId: string }[];
  adminClientIds?: string[];
}

/**
 * Autoriza o chamador a provisionar/editar `target` (§3.2). Admin global: livre.
 * clientAdmin: (a) tenants do target ⊆ escopo; (b) target não vira admin global
 * (bloqueia email no domínio admin — senão isAdminEmail fallback promoveria, V1);
 * (c) sub-delegação de adminClientIds ⊆ escopo. Tudo fail-closed.
 */
export async function verifyCanProvision(callerEmail: string, target: ProvisionTarget): Promise<ProvisionScope> {
  const scope = await getProvisionScope(callerEmail);
  if (!scope.allowed) return scope;
  if (scope.global) return { allowed: true, global: true, adminClientIds: [] };

  const targetTenants = (target.clientAccess ?? []).map((c) => c.clientId);
  if (!isSubset(targetTenants, scope.adminClientIds)) {
    return { allowed: false, global: false, adminClientIds: scope.adminClientIds, error: 'Tenant fora do seu escopo', status: 403 };
  }
  if (isAdminEmail(target.email)) {
    return { allowed: false, global: false, adminClientIds: scope.adminClientIds, error: 'Não é permitido provisionar admin global', status: 403 };
  }
  if (!isSubset(target.adminClientIds ?? [], scope.adminClientIds)) {
    return { allowed: false, global: false, adminClientIds: scope.adminClientIds, error: 'Sub-delegação fora do escopo', status: 403 };
  }
  return { allowed: true, global: false, adminClientIds: scope.adminClientIds };
}
```

- [ ] **Step 8: Rodar (verificar GREEN)**

Run: `pnpm vitest run src/shared/lib/api-auth.provision.test.ts`
Expected: PASS.

- [ ] **Step 9: Ligar o gate na rota (POST/GET/DELETE)**

Em `app/api/users/route.ts`, ajustar imports (remover `isAdminEmail` — não mais usado; adicionar os novos):

```ts
import { verifyAuthToken, verifyCanProvision, getProvisionScope } from '@/shared/lib/api-auth';
import { isSubset, mergeClientAccessByScope, mergeAdminClientIdsByScope } from '@/shared/lib/permissions/authorize';
```

Substituir a função `GET` inteira por:

```ts
export async function GET(req: NextRequest) {
  const email = await verifyAuthToken(req);
  if (!email) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }
  const scope = await getProvisionScope(email);
  if (!scope.allowed) {
    return NextResponse.json({ error: scope.error ?? 'Sem permissão' }, { status: scope.status ?? 403 });
  }

  try {
    const db = getDb();
    const snap = await db.collection('users').get();
    const all = snap.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        email: data.email ?? null,
        displayName: data.displayName ?? null,
        groups: data.groups ?? [],
        clientAccess: data.clientAccess ?? [],
        adminClientIds: data.adminClientIds ?? [],
      };
    });
    const users = scope.global
      ? all
      : all.filter((u) => isSubset((u.clientAccess as { clientId: string }[]).map((ca) => ca.clientId), scope.adminClientIds));
    return NextResponse.json({ data: users });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao carregar usuários';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

No `POST`, remover o bloco de gate atual:

```ts
  if (!isAdminEmail(email)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }
```

e, **após** a validação de refs de `groups` e **antes** do bloco "Abordagem A", inserir o gate + merge:

```ts
    const scope = await verifyCanProvision(email, {
      email: body.email,
      clientAccess: body.clientAccess ?? [],
      adminClientIds: body.adminClientIds ?? [],
    });
    if (!scope.allowed) {
      return NextResponse.json({ error: scope.error ?? 'Sem permissão' }, { status: scope.status ?? 403 });
    }

    // Merge por tenant para caller com escopo restrito (§3.3): preserva tenants
    // fora do escopo do doc existente; nunca concede/remove cross-tenant.
    let finalClientAccess = body.clientAccess ?? [];
    let finalAdminClientIds = body.adminClientIds ?? [];
    if (!scope.global) {
      const existingScopeSnap = await db.collection('users').doc(body.id).get();
      const existingData = existingScopeSnap.exists ? existingScopeSnap.data() ?? {} : {};
      const existingCA = (existingData.clientAccess ?? []) as { clientId: string; routeOverrides?: string[] | null }[];
      const existingAdmin = (existingData.adminClientIds ?? []) as string[];
      finalClientAccess = mergeClientAccessByScope(existingCA, finalClientAccess, scope.adminClientIds);
      finalAdminClientIds = mergeAdminClientIdsByScope(existingAdmin, finalAdminClientIds, scope.adminClientIds);
    }
```

Ainda no `POST`, trocar as duas referências que usavam o body cru pela versão "final":
- Na emissão do claim: `const clientIds = finalClientAccess.map((ca) => ca.clientId);` (substitui `(body.clientAccess ?? []).map(...)`).
- No `ref.set({...})`: `clientAccess: finalClientAccess,` e a spread de adminClientIds vira `...(finalAdminClientIds.length ? { adminClientIds: finalAdminClientIds } : {}),`.

Substituir a função `DELETE` inteira por:

```ts
export async function DELETE(req: NextRequest) {
  const email = await verifyAuthToken(req);
  if (!email) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }
  const scope = await getProvisionScope(email);
  if (!scope.allowed) {
    return NextResponse.json({ error: scope.error ?? 'Sem permissão' }, { status: scope.status ?? 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'ID é obrigatório' }, { status: 400 });
    }

    const db = getDb();
    const targetDoc = await db.collection('users').doc(id).get();
    if (targetDoc.exists) {
      const targetData = targetDoc.data() ?? {};
      // Self-deletion guard (preservado).
      if (targetData.email && targetData.email === email) {
        return NextResponse.json({ error: 'Você não pode excluir seu próprio usuário.' }, { status: 400 });
      }
      // clientAdmin não exclui usuário com tenant fora do seu escopo (V6).
      if (!scope.global) {
        const targetTenants = ((targetData.clientAccess ?? []) as { clientId: string }[]).map((ca) => ca.clientId);
        if (!isSubset(targetTenants, scope.adminClientIds)) {
          return NextResponse.json({ error: 'Sem permissão para excluir usuário fora do seu escopo.' }, { status: 403 });
        }
      }
    }

    await db.collection('users').doc(id).delete();
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao excluir usuário';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 10: Atualizar o mock do teste T2 e adicionar casos de escopo**

O teste de T2 (`app/api/users/__tests__/route.test.ts`) agora quebra porque a rota importa `verifyCanProvision`/`getProvisionScope` de api-auth. Estender o mock de api-auth para provê-los (default: admin global) e substituir o uso de `isAdminEmailMock` no gate. Trocar o `vi.mock('@/shared/lib/api-auth', ...)`:

```ts
vi.mock('@/shared/lib/api-auth', () => ({
  verifyAuthToken: verifyAuthTokenMock,
  verifyCanProvision: verifyCanProvisionMock,
  getProvisionScope: getProvisionScopeMock,
}));
```

Adicionar ao `vi.hoisted(...)` os mocks e defaults (admin global):

```ts
    verifyCanProvisionMock: vi.fn(async () => ({ allowed: true, global: true, adminClientIds: [] as string[] })),
    getProvisionScopeMock: vi.fn(async () => ({ allowed: true, global: true, adminClientIds: [] as string[] })),
```

E no `beforeEach`, resetar defaults:

```ts
    verifyCanProvisionMock.mockResolvedValue({ allowed: true, global: true, adminClientIds: [] });
    getProvisionScopeMock.mockResolvedValue({ allowed: true, global: true, adminClientIds: [] });
```

No caso "403 para não-admin", trocar `isAdminEmailMock.mockReturnValueOnce(false)` por:

```ts
    verifyCanProvisionMock.mockResolvedValueOnce({ allowed: false, global: false, adminClientIds: [], error: 'Sem permissão', status: 403 });
```

Adicionar um novo describe para o merge por tenant (adversarial, escopo restrito):

```ts
describe('POST /api/users — clientAdmin merge por tenant', () => {
  beforeEach(() => {
    verifyAuthTokenMock.mockResolvedValue('c@empresa.com');
    verifyCanProvisionMock.mockResolvedValue({ allowed: true, global: false, adminClientIds: ['vila-rosa'] });
    getProvisionScopeMock.mockResolvedValue({ allowed: true, global: false, adminClientIds: ['vila-rosa'] });
    dbState.usersCol.get.mockResolvedValue({ empty: true, docs: [] });
    authState.getUserByEmail.mockResolvedValue({ uid: 'uid-multi' });
    authState.setCustomUserClaims.mockClear();
    dbState.userDocRef.set.mockClear();
  });

  it('preserva a entrada de tenant fora do escopo (om) ao editar', async () => {
    // doc existente tem vila-rosa + om
    dbState.userDocRef.get.mockResolvedValue({
      exists: true,
      data: () => ({ clientAccess: [{ clientId: 'vila-rosa' }, { clientId: 'om', routeOverrides: ['/dashboard'] }] }),
    });
    // body malicioso: tenta remover om e manter só vila-rosa
    const res = await POST(req({
      id: 'multi_empresa_com', email: 'multi@empresa.com', displayName: 'Multi',
      groups: [], clientAccess: [{ clientId: 'vila-rosa' }],
    }));
    expect(res.status).toBe(200);
    const written = dbState.userDocRef.set.mock.calls.at(-1)![0];
    const writtenTenants = (written.clientAccess as { clientId: string }[]).map((c) => c.clientId).sort();
    expect(writtenTenants).toEqual(['om', 'vila-rosa']); // om preservado
    // claim reflete a união final
    expect(authState.setCustomUserClaims).toHaveBeenCalledWith('uid-multi', { clientIds: ['om', 'vila-rosa'] });
  });
});
```

> Nota: no `expect(...).toHaveBeenCalledWith('uid-multi', { clientIds: ['om', 'vila-rosa'] })` a ordem
> reflete `mergeClientAccessByScope` (preserved primeiro, mutable depois). Ajuste a expectativa à
> ordem real emitida se necessário (preserved=[om], mutable=[vila-rosa] → `['om','vila-rosa']`).

- [ ] **Step 11: Rodar toda a suíte da rota + helpers (GREEN)**

Run: `pnpm vitest run app/api/users/__tests__/route.test.ts src/shared/lib/api-auth.provision.test.ts src/shared/lib/permissions/authorize.test.ts`
Expected: PASS em todos.

- [ ] **Step 12: Commit**

```bash
git add src/shared/lib/permissions/authorize.ts src/shared/lib/permissions/authorize.test.ts src/shared/lib/api-auth.ts src/shared/lib/api-auth.provision.test.ts app/api/users/route.ts app/api/users/__tests__/route.test.ts
git commit -m "feat(rbac): papel clientAdmin com gate verifyCanProvision e merge por tenant (a4-12 T3)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task T4: UI (UserForm + useAdminUsers)

**Files:**
- Modify: `src/features/admin/model/types.ts:29-53` (tipos)
- Modify: `src/features/admin/model/useAdminUsers.ts:40-58` (save retorna body)
- Modify: `src/features/admin/ui/UserForm.tsx` (checkbox, resetLink, adminClientIds)
- Modify: `src/features/admin/ui/UsersTab.tsx:61-63` (propagar retorno)
- Create: `src/features/admin/ui/__tests__/UserForm.test.tsx`

**Interfaces:**
- Consumes: `POST /api/users` (body/response de T2/T3); `useUserPermissions().isAdmin` (`src/shared/hooks/useUserPermissions.tsx`).
- Produces:
  - `types.ts`: `adminClientIds?: string[]` em `UserDoc`; `SaveUserInput = Omit<UserDoc,'createdAt'> & { adminClientIds?: string[]; provisionCredential?: boolean; generatePasswordLink?: boolean }`; `SaveUserResult = { ok: boolean; uid?: string; credentialCreated?: boolean; resetLink?: string }`.
  - `useAdminUsers().save(id, data: SaveUserInput): Promise<SaveUserResult>`.
  - `UserFormProps.onSave(id, data: SaveUserInput): Promise<SaveUserResult>`.

**Risco:** baixo. **Testável por:** render/UX (Testing Library).

- [ ] **Step 1: Estender tipos**

Em `src/features/admin/model/types.ts`, alterar `UserDoc` (`:34-40`) para incluir `adminClientIds`:

```ts
export interface UserDoc {
  email: string;
  displayName: string;
  groups: string[];
  clientAccess: ClientAccess[];
  adminClientIds?: string[];
  createdAt: Timestamp;
}
```

E anexar ao final do arquivo:

```ts
export type SaveUserInput = Omit<UserDoc, 'createdAt'> & {
  provisionCredential?: boolean;
  generatePasswordLink?: boolean;
};

export interface SaveUserResult {
  ok: boolean;
  uid?: string;
  credentialCreated?: boolean;
  resetLink?: string;
}
```

- [ ] **Step 2: Escrever o teste do UserForm (RED)**

Criar `src/features/admin/ui/__tests__/UserForm.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UserForm } from '../UserForm';

const isAdminMock = vi.fn(() => true);
vi.mock('@/features/admin/model/useAdminGroups', () => ({ useAdminGroups: () => ({ groups: [] }) }));
vi.mock('@/features/admin/model/useAdminClients', () => ({
  useAdminClients: () => ({ clients: [{ id: 'vila-rosa', name: 'Vila Rosa', initial: 'VR', color: '#123456' }] }),
}));
vi.mock('@/shared/hooks/useUserPermissions', () => ({ useUserPermissions: () => ({ isAdmin: isAdminMock() }) }));

beforeEach(() => { isAdminMock.mockReturnValue(true); });

describe('UserForm — provisionamento', () => {
  it('exibe o checkbox "Criar credencial de acesso" (default marcado)', () => {
    render(<UserForm open onClose={() => {}} onSave={vi.fn(async () => ({ ok: true }))} />);
    const cb = screen.getByRole('checkbox', { name: /criar credencial/i }) as HTMLInputElement;
    expect(cb).toBeTruthy();
    expect(cb.checked).toBe(true);
  });

  it('após salvar novo usuário com resetLink, exibe o link one-shot', async () => {
    const onSave = vi.fn(async () => ({ ok: true, uid: 'u1', credentialCreated: true, resetLink: 'https://reset.example/xyz' }));
    render(<UserForm open onClose={() => {}} onSave={onSave} />);
    fireEvent.change(screen.getByPlaceholderText(/usuario@empresa/i), { target: { value: 'novo@empresa.com' } });
    fireEvent.change(screen.getByPlaceholderText(/nome do usuário/i), { target: { value: 'Novo' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));
    await waitFor(() => expect(screen.getByText(/https:\/\/reset\.example\/xyz/)).toBeTruthy());
  });

  it('campo adminClientIds visível para admin global', () => {
    render(<UserForm open onClose={() => {}} onSave={vi.fn(async () => ({ ok: true }))} />);
    expect(screen.getByText(/administra os clientes/i)).toBeTruthy();
  });

  it('campo adminClientIds OCULTO para não-admin', () => {
    isAdminMock.mockReturnValue(false);
    render(<UserForm open onClose={() => {}} onSave={vi.fn(async () => ({ ok: true }))} />);
    expect(screen.queryByText(/administra os clientes/i)).toBeNull();
  });
});
```

- [ ] **Step 3: Rodar (verificar RED)**

Run: `pnpm vitest run src/features/admin/ui/__tests__/UserForm.test.tsx`
Expected: FAIL — os elementos ainda não existem e `onSave` ainda retorna `void`.

- [ ] **Step 4: Implementar as mudanças no UserForm (GREEN)**

Em `src/features/admin/ui/UserForm.tsx`:

4a. Ajustar imports/props. Trocar o import de tipos (`:17`) e o `useUserPermissions`:

```tsx
import type { AppUser, ClientAccess, SaveUserInput, SaveUserResult } from '@/features/admin/model/types';
import { useUserPermissions } from '@/shared/hooks/useUserPermissions';
```

Trocar `UserFormProps.onSave` (`:23`):

```tsx
  onSave: (id: string, data: SaveUserInput) => Promise<SaveUserResult>;
```

4b. Adicionar estado (após `:48`):

```tsx
  const { isAdmin } = useUserPermissions();
  const [provisionCredential, setProvisionCredential] = useState(true);
  const [generatePasswordLink, setGeneratePasswordLink] = useState(true);
  const [adminClientIds, setAdminClientIds] = useState<string[]>([]);
  const [resetLink, setResetLink] = useState<string | null>(null);
```

No `useEffect` de reset (`:50-76`), no ramo `if (user)` adicionar `setAdminClientIds(user.adminClientIds ?? []);` e no `else` `setAdminClientIds([]);`; em ambos os ramos resetar `setResetLink(null); setProvisionCredential(true); setGeneratePasswordLink(true);`.

4c. Trocar `handleSave` (`:117-157`) para enviar os novos campos, capturar o retorno e exibir o resetLink:

```tsx
  const handleSave = async () => {
    if (!email.trim()) { setError('Email é obrigatório'); return; }

    const validClientIds = new Set(clients.map((c) => c.id));
    const invalidClients = selectedClients.filter((id) => !validClientIds.has(id));
    if (invalidClients.length > 0) {
      setError(`Cliente(s) inválido(s): ${invalidClients.join(', ')}`);
      return;
    }
    const validGroupIds = new Set(groups.map((g) => g.id));
    const invalidGroups = selectedGroups.filter((id) => !validGroupIds.has(id));
    if (invalidGroups.length > 0) {
      setError(`Grupo(s) inválido(s): ${invalidGroups.join(', ')}`);
      return;
    }

    const clientAccess: ClientAccess[] = selectedClients.map((clientId) => {
      const config = getClientConfig(clientId);
      return { clientId, routeOverrides: config.useGroupRoutes ? null : config.customRoutes };
    });
    // adminClientIds só entre os clientes selecionados (a fronteira de tenant contém o efeito).
    const scopedAdmin = isAdmin ? adminClientIds.filter((id) => selectedClients.includes(id)) : undefined;

    setSaving(true);
    setError('');
    try {
      const result = await onSave(generatedId, {
        email: email.trim(),
        displayName: displayName.trim(),
        groups: selectedGroups,
        clientAccess,
        ...(scopedAdmin ? { adminClientIds: scopedAdmin } : {}),
        provisionCredential,
        generatePasswordLink,
      });
      if (result?.resetLink) {
        setResetLink(result.resetLink); // one-shot: mostrado até fechar o form; não persiste
      } else {
        onClose();
      }
    } catch {
      setError('Erro ao salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };
```

4d. Adicionar a UI. Antes do bloco `{error && ...}` (`:372`), inserir:

- Checkbox credencial + link de senha:

```tsx
          {/* Provisionamento de credencial */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input
                type="checkbox"
                aria-label="Criar credencial de acesso"
                checked={provisionCredential}
                onChange={(e) => setProvisionCredential(e.target.checked)}
                disabled={saving}
              />
              Criar credencial de acesso
            </label>
            {provisionCredential && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer pl-6">
                <input
                  type="checkbox"
                  aria-label="Gerar link de definição de senha"
                  checked={generatePasswordLink}
                  onChange={(e) => setGeneratePasswordLink(e.target.checked)}
                  disabled={saving}
                />
                Gerar link de definição de senha (login por senha; dispensável para Google)
              </label>
            )}
          </div>
```

- Campo adminClientIds (só admin global), entre os clientes já selecionados:

```tsx
          {isAdmin && selectedClients.length > 0 && (
            <div>
              <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2 block">
                Administra os clientes (papel clientAdmin)
              </label>
              <div className="flex flex-wrap gap-2">
                {selectedClients.map((cid) => {
                  const checked = adminClientIds.includes(cid);
                  return (
                    <label key={cid} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setAdminClientIds((prev) => checked ? prev.filter((x) => x !== cid) : [...prev, cid])
                        }
                        disabled={saving}
                      />
                      {clients.find((c) => c.id === cid)?.name ?? cid}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
```

- Bloco resetLink one-shot (mostrado após criar):

```tsx
          {resetLink && (
            <div className="rounded-lg border border-primary/40 bg-primary/10 p-3 space-y-2">
              <p className="text-xs text-foreground">Link de definição de senha (entregue manualmente, uso único):</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-[11px] break-all text-muted-foreground">{resetLink}</code>
                <Button size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(resetLink)}>Copiar</Button>
              </div>
            </div>
          )}
```

- [ ] **Step 5: Propagar o retorno de `save`**

Em `src/features/admin/model/useAdminUsers.ts`, trocar o import (`:3`) e a assinatura de `save` (`:40-58`):

```ts
import type { AppUser, SaveUserInput, SaveUserResult } from './types';
```

```ts
  const save = useCallback(
    async (id: string, data: SaveUserInput): Promise<SaveUserResult> => {
      const headers = {
        'Content-Type': 'application/json',
        ...(await getAuthHeaders()),
      };
      const res = await window.fetch('/api/users', {
        method: 'POST',
        headers,
        body: JSON.stringify({ id, ...data }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || `Erro ${res.status}`);
      }
      await fetch();
      return body as SaveUserResult;
    },
    [fetch, getAuthHeaders]
  );
```

E no mapeamento de `fetch()` (`:25-31`), incluir `adminClientIds`:

```ts
        adminClientIds: Array.isArray(data.adminClientIds) ? (data.adminClientIds as string[]) : [],
```

Em `src/features/admin/ui/UsersTab.tsx`, trocar `handleSave` (`:61-63`) para repassar o retorno:

```tsx
  const handleSave = async (id: string, data: SaveUserInput) => {
    return save(id, data);
  };
```

e ajustar o import de tipos (`:19`) para incluir `SaveUserInput`:

```tsx
import type { AppUser, SaveUserInput } from '@/features/admin/model/types';
```

- [ ] **Step 6: Rodar (verificar GREEN)**

Run: `pnpm vitest run src/features/admin/ui/__tests__/UserForm.test.tsx`
Expected: PASS.

- [ ] **Step 7: Type-check da app**

Run: `pnpm lint`
Expected: PASS (sem erros de tipo/lint nas assinaturas alteradas de `onSave`/`save`/`handleSave`).

- [ ] **Step 8: Commit**

```bash
git add src/features/admin/model/types.ts src/features/admin/model/useAdminUsers.ts src/features/admin/ui/UserForm.tsx src/features/admin/ui/UsersTab.tsx src/features/admin/ui/__tests__/UserForm.test.tsx
git commit -m "feat(admin-ui): checkbox credencial, resetLink one-shot e adminClientIds no UserForm (a4-12 T4)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task T5: `grant-claims.ts` — `--clientIds` + alias `--clientId`

**Files:**
- Create: `scripts/lib/grant-claims-args.ts`
- Create: `scripts/lib/grant-claims-args.test.ts`
- Modify: `scripts/grant-claims.ts:35-98`

**Interfaces:**
- Consumes: nada novo.
- Produces:
  - `parseArgs(argv: string[]): { email?: string; clientIds?: string[]; role?: string; clear?: boolean; list?: boolean }`
  - `mergeClaims(existing: Record<string, unknown>, args: ReturnType<typeof parseArgs>): Record<string, unknown>`

**Risco:** baixo. **Testável por:** unit test do parser/merge (`pnpm vitest run`) + execução manual `--list` (usuário).

- [ ] **Step 1: Escrever o teste do parser (RED)**

Criar `scripts/lib/grant-claims-args.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseArgs, mergeClaims } from './grant-claims-args';

describe('parseArgs', () => {
  it('--clientIds=a,b,c → array', () => {
    expect(parseArgs(['--email=u@x.com', '--clientIds=a,b,c']).clientIds).toEqual(['a', 'b', 'c']);
  });
  it('alias --clientId=OM → [OM]', () => {
    expect(parseArgs(['--clientId=OM']).clientIds).toEqual(['OM']);
  });
  it('trim e descarte de vazios', () => {
    expect(parseArgs(['--clientIds=a, ,b,']).clientIds).toEqual(['a', 'b']);
  });
  it('--clear e --list', () => {
    expect(parseArgs(['--clear']).clear).toBe(true);
    expect(parseArgs(['--list']).list).toBe(true);
  });
});

describe('mergeClaims', () => {
  it('preserva claims existentes e adiciona clientIds', () => {
    expect(mergeClaims({ role: 'x' }, { clientIds: ['a', 'b'] })).toEqual({ role: 'x', clientIds: ['a', 'b'] });
  });
  it('aplica role', () => {
    expect(mergeClaims({}, { role: 'admin' })).toEqual({ role: 'admin' });
  });
  it('sem clientIds/role → devolve o existente inalterado', () => {
    expect(mergeClaims({ clientIds: ['z'] }, {})).toEqual({ clientIds: ['z'] });
  });
});
```

- [ ] **Step 2: Rodar (verificar RED)**

Run: `pnpm vitest run scripts/lib/grant-claims-args.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar o parser (GREEN)**

Criar `scripts/lib/grant-claims-args.ts`:

```ts
export interface CliArgs {
  email?: string;
  clientIds?: string[];
  role?: string;
  clear?: boolean;
  list?: boolean;
}

export function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {};
  for (const arg of argv) {
    if (arg === '--clear') out.clear = true;
    else if (arg === '--list') out.list = true;
    else if (arg.startsWith('--email=')) out.email = arg.slice('--email='.length);
    else if (arg.startsWith('--clientIds=')) {
      out.clientIds = arg.slice('--clientIds='.length).split(',').map((s) => s.trim()).filter(Boolean);
    } else if (arg.startsWith('--clientId=')) {
      // Alias legado: preenche clientIds:[x] (ADR-0018 §4.3).
      out.clientIds = [arg.slice('--clientId='.length).trim()].filter(Boolean);
    } else if (arg.startsWith('--role=')) out.role = arg.slice('--role='.length);
  }
  return out;
}

export function mergeClaims(existing: Record<string, unknown>, args: CliArgs): Record<string, unknown> {
  const merged = { ...existing };
  if (args.clientIds && args.clientIds.length > 0) merged.clientIds = args.clientIds;
  if (args.role) merged.role = args.role;
  return merged;
}
```

- [ ] **Step 4: Rodar (verificar GREEN)**

Run: `pnpm vitest run scripts/lib/grant-claims-args.test.ts`
Expected: PASS.

- [ ] **Step 5: Ligar no script**

Em `scripts/grant-claims.ts`: remover a `interface CliArgs` local (`:35-41`) e a função `parseArgs` local (`:43-53`); adicionar o import após a linha 26:

```ts
import { parseArgs, mergeClaims } from './lib/grant-claims-args';
```

Substituir o bloco de merge (`:84-98`) por:

```ts
  let newClaims: Record<string, unknown> | null;
  if (args.clear) {
    newClaims = null;
    console.log('→ Removendo todos os claims...');
  } else {
    const merged = mergeClaims(user.customClaims ?? {}, args);
    if (Object.keys(merged).length === 0) {
      console.error('Erro: nada a fazer. Use --clientIds, --clientId, --role ou --clear.');
      process.exit(1);
    }
    newClaims = merged;
    console.log('→ Aplicando claims:', merged);
  }
```

E trocar a chamada `parseArgs()` (`:68`) por `parseArgs(process.argv.slice(2))`. Atualizar o bloco de comentário de uso (`:16-22`) acrescentando a linha:

```
 *   pnpm tsx scripts/grant-claims.ts --email=user@example.com --clientIds=OM,BRZ
```

- [ ] **Step 6: Verificar que o script compila**

Run: `pnpm vitest run scripts/lib/grant-claims-args.test.ts && pnpm lint`
Expected: PASS (o teste continua verde; lint sem erro no script). Execução real (`--list`) é do usuário, em ambiente com ADC.

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/grant-claims-args.ts scripts/lib/grant-claims-args.test.ts scripts/grant-claims.ts
git commit -m "feat(scripts): grant-claims suporta --clientIds e alias --clientId (a4-12 T5)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task T6: Backfill one-time do claim `clientIds`

**Files:**
- Create: `scripts/lib/backfill-plan.ts`
- Create: `scripts/lib/backfill-plan.test.ts`
- Create: `scripts/backfill-client-ids-claim.ts`

**Interfaces:**
- Consumes: `getDb` (Firestore), `getAdminAuth` (Auth). Executado pelo usuário.
- Produces: `buildBackfillPlan(users: { email?: string; clientAccess?: { clientId: string }[] }[]): { email: string; clientIds: string[] }[]`.

**Risco:** médio (escreve claims em massa). **Testável por:** unit test da função pura + dry-run (default) + verificação de amostra (usuário).

- [ ] **Step 1: Escrever o teste do plano (RED)**

Criar `scripts/lib/backfill-plan.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildBackfillPlan } from './backfill-plan';

describe('buildBackfillPlan', () => {
  it('mapeia clientAccess → clientIds', () => {
    expect(buildBackfillPlan([
      { email: 'a@x.com', clientAccess: [{ clientId: 'om' }, { clientId: 'brz' }] },
    ])).toEqual([{ email: 'a@x.com', clientIds: ['om', 'brz'] }]);
  });
  it('ignora usuários sem clientAccess ou sem email', () => {
    expect(buildBackfillPlan([
      { email: 'b@x.com', clientAccess: [] },
      { clientAccess: [{ clientId: 'om' }] },
      { email: 'c@x.com' },
    ])).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar (verificar RED)**

Run: `pnpm vitest run scripts/lib/backfill-plan.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar a função pura (GREEN)**

Criar `scripts/lib/backfill-plan.ts`:

```ts
export interface BackfillUser {
  email?: string;
  clientAccess?: { clientId: string }[];
}

export interface BackfillEntry {
  email: string;
  clientIds: string[];
}

/** Para cada usuário com email + clientAccess não-vazio, deriva o claim clientIds. */
export function buildBackfillPlan(users: BackfillUser[]): BackfillEntry[] {
  return users
    .filter((u): u is Required<Pick<BackfillUser, 'email'>> & BackfillUser =>
      !!u.email && Array.isArray(u.clientAccess) && u.clientAccess.length > 0)
    .map((u) => ({ email: u.email, clientIds: u.clientAccess!.map((ca) => ca.clientId) }));
}
```

- [ ] **Step 4: Rodar (verificar GREEN)**

Run: `pnpm vitest run scripts/lib/backfill-plan.test.ts`
Expected: PASS.

- [ ] **Step 5: Escrever o script one-time**

Criar `scripts/backfill-client-ids-claim.ts` (dry-run é o default; `--apply` escreve):

```ts
#!/usr/bin/env tsx
/**
 * Backfill one-time do claim `clientIds` (ADR-0018 §4.3).
 *
 * Para cada `users/{id}` com `clientAccess`, seta o claim
 * `clientIds = clientAccess.map(clientId)` (merge, preservando role etc.).
 *
 * Uso:
 *   pnpm tsx scripts/backfill-client-ids-claim.ts            # dry-run (default)
 *   pnpm tsx scripts/backfill-client-ids-claim.ts --apply    # escreve os claims
 *
 * Executado pelo usuário em ambiente com credenciais (ADC / SA). O plano NÃO roda.
 */
import { getDb, getAdminAuth } from '../src/shared/lib/firebase/admin';
import { buildBackfillPlan, type BackfillUser } from './lib/backfill-plan';

async function main(): Promise<void> {
  const apply = process.argv.slice(2).includes('--apply');
  const db = getDb();
  const snap = await db.collection('users').get();
  const users: BackfillUser[] = snap.docs.map((d) => {
    const data = d.data();
    return { email: data.email as string | undefined, clientAccess: data.clientAccess as { clientId: string }[] | undefined };
  });

  const plan = buildBackfillPlan(users);
  console.log(`${plan.length} usuário(s) elegível(is). Modo: ${apply ? 'APPLY' : 'DRY-RUN'}`);

  const auth = getAdminAuth();
  for (const entry of plan) {
    if (!apply) {
      console.log(`[dry-run] ${entry.email} → clientIds=${JSON.stringify(entry.clientIds)}`);
      continue;
    }
    try {
      const u = await auth.getUserByEmail(entry.email);
      await auth.setCustomUserClaims(u.uid, { ...(u.customClaims ?? {}), clientIds: entry.clientIds });
      console.log(`✓ ${entry.email} → clientIds=${JSON.stringify(entry.clientIds)}`);
    } catch (e) {
      console.warn(`⚠ ${entry.email}: ${(e as Error).message}`);
    }
  }

  if (apply) {
    console.log('Concluído. Usuários precisam re-logar (ou aguardar refresh ≤1h) para o JWT novo.');
  }
}

main().catch((err) => {
  console.error('Erro:', err);
  process.exit(1);
});
```

- [ ] **Step 6: Verificar compilação (sem executar o script)**

Run: `pnpm vitest run scripts/lib/backfill-plan.test.ts && pnpm lint`
Expected: PASS. **Não** executar o script (dry-run/apply são do usuário).

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/backfill-plan.ts scripts/lib/backfill-plan.test.ts scripts/backfill-client-ids-claim.ts
git commit -m "feat(scripts): backfill one-time do claim clientIds (dry-run default) (a4-12 T6)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task T7 ⚠: Verificação adversarial end-to-end (gate de merge)

**Files:**
- Create: `app/api/users/__tests__/route-adversarial.test.ts`

**Interfaces:**
- Consumes: `POST`/`GET`/`DELETE` de `app/api/users/route.ts` com **`verifyCanProvision`/`getProvisionScope` REAIS** (não mockados) e helpers de authorize reais; mocka apenas `getDb` (via `buildDb`), `getAdminAuth` e `verifyAuthToken`.
- Produces: suíte adversarial que é **gate de merge** (paridade com o gate zero-recall do ADR-0006 §7) cobrindo V1–V6 do design §5.

**Risco:** ⚠ **alto** — é a prova end-to-end de que o RBAC + merge não escalonam privilégio. TDD adversarial (RED que prova a negação) + revisão humana obrigatória.

- [ ] **Step 1: Escrever a suíte adversarial (deve começar RED enquanto as barreiras não estiverem completas; após T3, vira GREEN)**

Criar `app/api/users/__tests__/route-adversarial.test.ts`. Aqui **NÃO** mockamos `@/shared/lib/api-auth` inteiro — só `verifyAuthToken`; `verifyCanProvision`/`getProvisionScope` rodam de verdade sobre o `buildDb`:

```ts
/* @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { verifyAuthTokenMock, isAdminEmailMock, state } = vi.hoisted(() => ({
  verifyAuthTokenMock: vi.fn(async (): Promise<string | null> => 'c@empresa.com'),
  isAdminEmailMock: vi.fn((e?: string) => (e ?? '').endsWith('@askliquid.com')),
  state: {
    // users por email (para getProvisionScope) e por id (doc), clients, groups
    usersByEmail: {} as Record<string, { id: string; data: Record<string, unknown> }>,
    usersById: {} as Record<string, Record<string, unknown>>,
    clientIds: ['vila-rosa', 'om', 'brz'],
    groupIds: [] as string[],
    lastSet: null as Record<string, unknown> | null,
    deleted: [] as string[],
  },
}));

// Só verifyAuthToken é mockado; verifyCanProvision/getProvisionScope rodam REAIS.
vi.mock('@/shared/lib/api-auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/api-auth')>();
  return { ...actual, verifyAuthToken: verifyAuthTokenMock };
});
vi.mock('@/shared/lib/runtime-config', () => ({ isAdminEmail: (...a: unknown[]) => isAdminEmailMock(...a) }));
vi.mock('firebase-admin/auth', () => ({ getAuth: vi.fn(() => ({})) }));
vi.mock('firebase-admin/firestore', () => ({ Timestamp: { now: () => ({ seconds: 0, nanoseconds: 0 }) } }));
vi.mock('@/shared/lib/firebase/admin', () => ({
  getDb: () => buildDb(),
  getAdminAuth: () => ({
    getUserByEmail: vi.fn(async () => ({ uid: 'uid-x', customClaims: {} })),
    createUser: vi.fn(async () => ({ uid: 'uid-x' })),
    setCustomUserClaims: vi.fn(async () => undefined),
    generatePasswordResetLink: vi.fn(async () => 'https://reset/x'),
  }),
}));

function buildDb() {
  return {
    collection(name: string) {
      if (name === 'clients') return { get: async () => ({ docs: state.clientIds.map((id) => ({ id })) }) };
      if (name === 'groups') return { get: async () => ({ docs: state.groupIds.map((id) => ({ id })) }) };
      // users
      return {
        where(_f: string, _op: string, value: string) {
          return { limit: () => ({ get: async () => {
            const u = state.usersByEmail[value];
            return { empty: !u, docs: u ? [{ id: u.id, data: () => u.data }] : [] };
          } }) };
        },
        get: async () => ({ docs: Object.entries(state.usersById).map(([id, data]) => ({ id, data: () => data })) }),
        doc(id: string) {
          return {
            get: async () => ({ exists: !!state.usersById[id], data: () => state.usersById[id] ?? {} }),
            set: async (payload: Record<string, unknown>) => { state.lastSet = payload; state.usersById[id] = { ...(state.usersById[id] ?? {}), ...payload }; },
            delete: async () => { state.deleted.push(id); delete state.usersById[id]; },
          };
        },
      };
    },
  };
}

import { NextRequest } from 'next/server';
import { POST, GET, DELETE } from '../route';

function post(body: unknown, caller = 'c@empresa.com'): NextRequest {
  verifyAuthTokenMock.mockResolvedValueOnce(caller);
  return new Request('http://localhost/api/users', {
    method: 'POST', headers: { authorization: 'Bearer t', 'content-type': 'application/json' }, body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  isAdminEmailMock.mockImplementation((e?: string) => (e ?? '').endsWith('@askliquid.com'));
  state.usersByEmail = {
    'c@empresa.com': { id: 'c_empresa_com', data: { email: 'c@empresa.com', adminClientIds: ['vila-rosa'] } },
  };
  state.usersById = {};
  state.lastSet = null;
  state.deleted = [];
});

describe('adversarial — clientAdmin (V1–V6)', () => {
  it('V1a: clientAdmin concede tenant fora do escopo → 403', async () => {
    const res = await POST(post({ id: 'u_empresa_com', email: 'u@empresa.com', displayName: 'U', groups: [], clientAccess: [{ clientId: 'om' }] }));
    expect(res.status).toBe(403);
    expect(state.lastSet).toBeNull(); // nenhum efeito
  });

  it('V1b: clientAdmin cria admin global (@askliquid.com) → 403', async () => {
    const res = await POST(post({ id: 'evil_askliquid_com', email: 'evil@askliquid.com', displayName: 'E', groups: [], clientAccess: [{ clientId: 'vila-rosa' }] }));
    expect(res.status).toBe(403);
    expect(state.lastSet).toBeNull();
  });

  it('V1c: clientAdmin auto-promove adminClientIds fora do escopo → 403', async () => {
    const res = await POST(post({ id: 'u_empresa_com', email: 'u@empresa.com', displayName: 'U', groups: [], clientAccess: [{ clientId: 'vila-rosa' }], adminClientIds: ['om'] }));
    expect(res.status).toBe(403);
  });

  it('caminho feliz: clientAdmin cria usuário só no seu tenant → 200', async () => {
    const res = await POST(post({ id: 'u_empresa_com', email: 'u@empresa.com', displayName: 'U', groups: [], clientAccess: [{ clientId: 'vila-rosa' }] }));
    expect(res.status).toBe(200);
    expect((state.lastSet!.clientAccess as { clientId: string }[]).map((c) => c.clientId)).toEqual(['vila-rosa']);
  });

  it('V1d: edição cross-tenant preserva a entrada fora do escopo (om intacto)', async () => {
    state.usersById['u_empresa_com'] = { email: 'u@empresa.com', clientAccess: [{ clientId: 'vila-rosa' }, { clientId: 'om', routeOverrides: ['/dashboard'] }] };
    const res = await POST(post({ id: 'u_empresa_com', email: 'u@empresa.com', displayName: 'U', groups: [], clientAccess: [{ clientId: 'vila-rosa' }] }));
    expect(res.status).toBe(200);
    const tenants = (state.lastSet!.clientAccess as { clientId: string }[]).map((c) => c.clientId).sort();
    expect(tenants).toEqual(['om', 'vila-rosa']);
  });

  it('V6a: GET por clientAdmin lista só usuários no escopo', async () => {
    state.usersById = {
      a: { email: 'a@e.com', clientAccess: [{ clientId: 'vila-rosa' }] },
      b: { email: 'b@e.com', clientAccess: [{ clientId: 'om' }] },
    };
    verifyAuthTokenMock.mockResolvedValueOnce('c@empresa.com');
    const res = await GET(new Request('http://localhost/api/users', { headers: { authorization: 'Bearer t' } }) as unknown as NextRequest);
    const body = await res.json();
    expect(body.data.map((u: { id: string }) => u.id)).toEqual(['a']);
  });

  it('V6b: DELETE por clientAdmin de alvo fora do escopo → 403', async () => {
    state.usersById['b'] = { email: 'b@e.com', clientAccess: [{ clientId: 'om' }] };
    verifyAuthTokenMock.mockResolvedValueOnce('c@empresa.com');
    const res = await DELETE(new Request('http://localhost/api/users?id=b', { method: 'DELETE', headers: { authorization: 'Bearer t' } }) as unknown as NextRequest);
    expect(res.status).toBe(403);
    expect(state.deleted).not.toContain('b');
  });

  it('regressão: admin global mantém acesso total (V7 — sem regressão de isolamento)', async () => {
    const res = await POST(post({ id: 'any_com', email: 'any@empresa.com', displayName: 'A', groups: [], clientAccess: [{ clientId: 'om' }, { clientId: 'brz' }] }, 'admin@askliquid.com'));
    expect(res.status).toBe(200);
    expect((state.lastSet!.clientAccess as { clientId: string }[]).map((c) => c.clientId).sort()).toEqual(['brz', 'om']);
  });
});
```

- [ ] **Step 2: Rodar a suíte adversarial (verificar GREEN após T1–T3)**

Run: `pnpm vitest run app/api/users/__tests__/route-adversarial.test.ts`
Expected: PASS. Se algum caso de negação (V1a/V1b/V1c/V6b) passar como 200/permitido, é **regressão de segurança** → parar e corrigir a barreira em T3 antes de prosseguir.

- [ ] **Step 3: Rodar a suíte relacionada inteira (gate de merge)**

Run: `pnpm vitest run app/api/users src/shared/lib/api-auth.provision.test.ts src/shared/lib/permissions/authorize.test.ts`
Expected: PASS em todos. Registrar a saída no PR como evidência (task ⚠, revisão humana).

- [ ] **Step 4: Anotar a cobertura manual de V7 (rules)**

V7 (cross-tenant via client SDK direto contra as rules) **não** é coberto por Vitest — remete ao checklist manual de T1 (Step 4) + `firebase deploy --only firestore:rules` (usuário). Registrar no PR que V7 foi verificado por T1.

- [ ] **Step 5: Commit**

```bash
git add app/api/users/__tests__/route-adversarial.test.ts
git commit -m "test(users): suíte adversarial V1-V6 do RBAC clientAdmin (gate de merge) (a4-12 T7)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review (executado pelo autor do plano)

**1. Cobertura da spec:**
- §0 (Abordagem A, admin por-tenant, multi-cliente) → T2, T3, T1. ✓
- §2 (contrato POST, fluxo criar-vs-editar, senha vs Google, fonte do claim, erros, critérios) → T2 (+ resetLink/idempotência/502/500/provisionCredential). ✓
- §2.5 (UserForm/useAdminUsers) → T4. ✓
- §3 (RBAC clientAdmin, gate, merge por tenant, GET/DELETE, barreiras) → T3 + T7. ✓
- §4 (claim conjunto + rules, back-compat, migração, ADR-0009) → T1 (rules), T5/T6 (writers/backfill). ✓
- §5 (V1–V7) → T7 (V1–V6 automatizado) + T1 (V7 manual). ✓
- §6 (ADR-0018) → T0. ✓
- §7 (T0–T7) → todas mapeadas. ✓
- §8 (questões em aberto) → resolvidas pelos defaults do design: reset-link não persiste (T4 one-shot), clientAdmin lista/exclui só no escopo (T3), único writer do claim = POST /api/users (Global Constraints + T5/T6 re-emitem via script). ✓

**2. Placeholders:** nenhum "TODO"/"add validation"/"similar to Task N" — todo passo tem código real e comando com expected output. ✓

**3. Consistência de tipos/nomes:** `clientIds`, `adminClientIds`, `verifyCanProvision`, `getProvisionScope`, `tenantAllowed`, `getAdminAuth`, `isSubset`, `mergeClientAccessByScope`, `mergeAdminClientIdsByScope`, `SaveUserInput`, `SaveUserResult` usados de forma idêntica entre T1–T7. ✓

**Ambiguidade residual assumida (documentada):** `generatePasswordLink` não consta do contrato canônico §2.1 mas materializa o checkbox de §2.5 ("Gerar link de definição de senha") — modelado como campo opcional default `true`, gating apenas do `resetLink` quando `credentialCreated`. Se os deciders preferirem inferir Google-only por outro sinal, ajustar em T2/T4.

---

## Execution Handoff

**Plano completo e salvo em `docs/superpowers/plans/2026-07-21-a4-12-provisionamento.md`. Duas opções de execução:**

**1. Subagent-Driven (recomendado)** — um subagente novo por task, com revisão entre tasks (crítico para T1/T3/T7 ⚠).

**2. Inline Execution** — executar as tasks nesta sessão via executing-plans, em lotes com checkpoints.

**Qual abordagem?**
