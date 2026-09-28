# Design — Provisionamento de usuário externo (achado a4-12)

- **Data:** 2026-07-21
- **Status:** Proposed
- **Autor:** arquitetura (design read-only)
- **Achado de origem:** `a4-cliente-permissoes-12` — *"Não há fluxo no app para criar a
  credencial do usuário nem setar o claim clientId; onboarding exige console Firebase +
  script manual"* (`docs/auditoria/2026-07-21-registro-achados.md:1438-1456`), severidade
  **alta**, bloqueia **DoD-1 #6**. Relacionado a `a4-...-10`
  (`provisionamento-usuario-manual-fail-closed`, `:1358-1376`) e `a4-...-11`
  (rules de subcoleções `clients/{id}/groups|reports`, `:1418-1436`).
- **ADRs tocadas:** ADR-0006 (multi-tenancy), ADR-0009 (rules `sqlCatalog`), ADR-0013
  (Firestore storage).

> **Escopo deste documento:** apenas design/spec. Nenhuma linha de código, rule ou seed
> é alterada aqui. Todas as afirmações de superfície citam `arquivo:linha` confirmado por
> leitura.

---

## 0. Decisões de produto já fixadas (entrada)

Estas decisões vêm do usuário e são premissa, não estão em aberto:

1. **Abordagem A** — a Admin UI cria a credencial numa única ação server-side: Admin SDK
   `getAuth().createUser()` + `setCustomUserClaims()` + write do doc Firestore. Cobre
   email/senha **e** Google. O admin recebe um `generatePasswordResetLink` para entregar
   manualmente (não há e-mail transacional no repo — não inventar).
2. **Admin por-tenant** — além do admin global `@askliquid.com`, existe um papel novo
   ("admin do cliente") que pode provisionar usuários **do(s) seu(s) tenant(s)**. O gate
   de `POST /api/users` muda.
3. **Multi-cliente** — um usuário externo pode acessar 2+ clientes. O claim `clientId`
   é singular hoje e precisa virar múltiplo.

---

## 1. Estado atual (fatos confirmados)

### 1.1 Login e criação de perfil
- `src/features/auth/model/useAuth.ts:6-11` importa `signInWithPopup`,
  `signInWithEmailAndPassword`, `sendPasswordResetEmail`. **Não** há
  `createUserWithEmailAndPassword` em lugar nenhum do repo (grep=0). Handlers:
  `signInWithGoogle` (`:104-113`), `signInWithEmail` (`:115-124`),
  `resetPassword` (`:131-141`).
- `fetchProfile` (`useAuth.ts:36-81`): (1) busca doc por `uid` (`:41-45`); (2) senão por
  `email`, fazendo merge que preserva `groups`/`clientAccess` (`:47-63`); (3) senão cria
  doc novo **vazio** — `groups: []`, `clientAccess: []` (`:65-77`). Ou seja, primeiro
  login sem pré-provisionamento nasce sem permissão (fail-closed correto — achado a4-10).

### 1.2 `POST /api/users` hoje
- `app/api/users/route.ts:39-118`. Gate: `verifyAuthToken(req)` (`:40`) + `isAdminEmail(email)`
  (`:44`). **Nunca** toca Firebase Auth: só faz `ref.set({...doc}, {merge:true})`
  (`:104-111`). Body: `{id, email, displayName, groups[], clientAccess:{clientId}[]}`
  (`:49-55`). Valida email duplicado (`:73-76`), refs de `clientAccess` (`:79-87`) e de
  `groups` (`:89-98`). GET (`:8-37`) e DELETE (`:120-154`) usam o mesmo gate
  `verifyAuthToken`+`isAdminEmail`; DELETE tem guard de auto-exclusão (`:138-145`).
- **Importante:** o gate usa `isAdminEmail` (fallback de domínio, `runtime-config.ts:32-35`),
  **não** o gate `require-admin.ts` que também aceita o claim `role==='admin'`.

### 1.3 Onde claims são setados hoje
- Somente `scripts/grant-claims.ts:100` (`setCustomUserClaims`). Merge de `clientId`
  (`:90`) e `role` (`:91`) singulares. Exige conta Auth **já existente**
  (`getUserByEmail`, `:80`). É manual, fora do app.

### 1.4 Admin SDK disponível server-side
- `src/shared/lib/firebase/admin.ts` exporta só Firestore (`getDb()`, `:53-55`), **mas**
  `firebase-admin/auth` já é usado em `api-auth.ts:2` e `require-admin.ts:3`
  (`verifyIdToken`), e a app Admin é auto-inicializada (`ensureAdminApp`, `:13-28`,
  auto-init `:58`). Logo `getAuth().createUser()`, `.setCustomUserClaims()` e
  `.generatePasswordResetLink()` já estão disponíveis sem bootstrap novo.

### 1.5 Os dois mecanismos independentes (o "modelo duplo")
- **Claim `token.clientId`** → consumido **exclusivamente pelas Firestore rules**
  (`firestore.rules`) e escrito por `grant-claims.ts`.
- **Doc `users/{id}.clientAccess[]`** → consumido por `verifyDatasetAccess`
  (`api-auth.ts:88-169`), `verifyClientAccess` (`:182-207`), `verifyRouteAccess`
  (`:218-255`) e por `canAccessRoute` (`authorize.ts:35-49`).
- **Correção ao briefing:** `api-auth.ts` e `require-admin.ts` **não** leem
  `token.clientId`. `api-auth.ts` só extrai `email` do token (`verifyAuthToken:45-70`) e
  cruza com o **doc**; `require-admin.ts:57-64` lê o claim **`role`** (não `clientId`).
  Portanto a migração singular→plural do claim `clientId` toca **apenas** as rules e o
  writer `grant-claims.ts` — a camada de API não muda por causa do claim (muda por causa
  do RBAC, §3).

### 1.6 Consumidores atuais de `token.clientId` (a mudar)
Todos em `firestore.rules`:

| # | Site | Linha | Forma |
|---|---|---|---|
| 1 | `tenantMatches()` helper | `:25-29` (uso do claim em `:28`) | `token.clientId == resource.data.clientId` — usado por 6 coleções server-managed: `workingMemory` (`:95`), `embeddingsDocs` (`:109`), `embeddingsSql` (`:113`), `embeddingsBlocks` (`:117`), `sqlCatalog` (`:125`), `sqlCatalogEvents` (`:129`) |
| 2 | `clients/{clientId}/groups` read | `:41` | `token.clientId == clientId` (path var) |
| 3 | `clients/{clientId}/groups` write | `:42` | idem |
| 4 | `.../groups/{g}/reports` read | `:46` | idem |
| 5 | `.../groups/{g}/reports` write | `:47` | idem |
| 6 | `workingMemory/{t}/messages` read | `:99-102` | inline `token.clientId == resource.data.clientId` |

Total: **6 sites de rule** (1 via helper compartilhado cobrindo 6 coleções + 5 inline)
+ **1 writer** (`grant-claims.ts`). Nota (a4-12): o consumo client-SDK das coleções
server-managed é hoje **latente** (nenhum `getFirebaseDb()` do app lê
`workingMemory`/`embeddings*`/`sqlCatalog*` — confirmado no achado `:1444`); mas os sites
2-5 (subcoleções de cliente, pós-fix a4-11) **são** caminho real de client SDK e precisam
suportar multi-cliente para não regredir o usuário multi-tenant.

---

## 2. Extensão do `POST /api/users` (Abordagem A)

### 2.1 Novo contrato
Body (compatível + campos novos, todos opcionais para não quebrar chamadas atuais):

```
{
  id: string,                         // slug de email (já validado por UserDocId)
  email: string,
  displayName: string,
  groups: string[],
  clientAccess: { clientId: string, routeOverrides?: string[]|null }[],
  adminClientIds?: string[],          // §3 — tenants que ESTE usuário poderá administrar
  provisionCredential?: boolean       // default true: cria conta Auth + claim
}
```

Resposta (create):

```
{ ok: true, uid: string, resetLink?: string, credentialCreated: boolean }
```

- `resetLink` só é devolvido quando uma conta email/senha foi criada nesta chamada (ver
  §2.3). Nunca em GET/list, nunca em edit.

### 2.2 Fluxo criar-vs-editar (server-side, ordem importa)

```
1. Autz do chamador (§3). Fail-closed antes de qualquer efeito.
2. Validações atuais mantidas: email/displayName obrigatórios (route.ts:57-61),
   UserDocId.safeParse (:65-68), refs de clientAccess (:79-87) e groups (:89-98),
   email duplicado (:73-76).
3. Resolver conta Auth de forma IDEMPOTENTE:
   try  uid = getAuthByEmail(email).uid            // já existe → reusar
   catch(auth/user-not-found):
        user = createUser({ email, displayName })   // sem password (ver §2.3)
        uid = user.uid ; credentialCreated = true
   // qualquer outro erro do Auth → 502/500 tipado, NÃO grava doc.
4. setCustomUserClaims(uid, mergeClaims(existing, {
        clientIds: clientAccess.map(c => c.clientId)   // §2.4 (fonte única = doc)
        // role/admin NÃO são tocados aqui salvo por admin global (§3)
   }))
5. Write do doc users/{id} (mantém o set/merge atual em route.ts:104-111) +
   novos campos: adminClientIds (se autorizado). doc.id continua = slugifyEmail(email).
6. Se credentialCreated e o admin optou por senha (não-Google): resetLink =
   generatePasswordResetLink(email).  (Google-only → pular; ver §2.3.)
7. Retornar { ok, uid, resetLink?, credentialCreated }.
```

**Ordem e atomicidade:** Auth (createUser) → claim → doc. Se o passo 5 (doc) falhar após
criar a conta, a conta fica órfã mas inofensiva (sem doc → `api-auth` nega tudo,
fail-closed) e a chamada retorna erro; a re-execução é idempotente (passo 3 reusa a
conta). Se o passo 4 (claim) falhar, abortar antes de gravar o doc — assim doc e claim
nunca divergem "para mais" (doc nunca concede mais que o claim). Ver §5 (dessincronização).

### 2.3 Senha vs Google
- `createUser` **sem** `password`: a conta existe mas não loga por email/senha até o
  usuário usar o reset-link (`generatePasswordResetLink`) para **definir** a senha. É o
  fluxo desejado (Abordagem A). Cobre também Google: se o usuário logar via
  `signInWithPopup` com o mesmo email, o Firebase vincula a credencial Google ao mesmo
  uid; `fetchProfile` (`useAuth.ts:47-63`) já casa o doc por email. Para usuários
  Google-only o reset-link é dispensável (a UI oferece um checkbox "enviar link de senha
  (login por senha)").
- O reset-link é **entregue manualmente** pelo admin (copiar da UI). Não há envio
  server-side (sem infra de e-mail — confirmado).

### 2.4 Fonte de verdade do claim
- O array `clientIds` do claim é **derivado** de `clientAccess[]` do doc a cada
  provisionamento: `clientIds = clientAccess.map(ca => ca.clientId)`. O doc continua sendo
  a fonte canônica (consumida pela API); o claim é uma projeção read-only para as rules.
  Isso elimina drift por construção — quem edita `clientAccess` re-emite o claim na mesma
  chamada.

### 2.5 Mudanças em `UserForm.tsx` / `useAdminUsers.ts`
- `useAdminUsers.save` (`useAdminUsers.ts:40-58`) passa a repassar `adminClientIds` e
  `provisionCredential`, e a **retornar** o body da resposta (hoje descarta) para a UI
  exibir o `resetLink`.
- `UserForm.tsx`:
  - Novo checkbox "Criar credencial de acesso" (default on) e "Gerar link de definição de
    senha" (para não-Google).
  - Após salvar um usuário novo, exibir um bloco com o `resetLink` + botão copiar
    (one-shot; não persistir na UI).
  - Campo `adminClientIds` (multi-seleção entre os clientes já selecionados) **visível
    apenas ao admin global** — clientAdmin não promove clientAdmin fora do seu escopo
    (§3).
  - Para um clientAdmin logado, a lista de clientes (`useAdminClients`) é filtrada para o
    seu `adminClientIds` (a UI é cosmética; o gate real é server-side, §3).

### 2.6 Erros
- `email` já existe no Auth mas com doc de outro `id` → 400 (mantém a checagem de email
  duplicado atual, `:73-76`).
- Erro `auth/*` inesperado no createUser → 502 tipado, sem gravar doc.
- Falha ao setar claim → 500 tipado, sem gravar doc (não deixar doc "à frente" do claim).

### Critérios de aceite §2
- [ ] Criar usuário novo pela UI resulta em: conta Auth existente (`getUserByEmail` ok),
      claim `clientIds` = `clientAccess` do doc, doc gravado, e `resetLink` retornado
      quando `provisionCredential && !googleOnly`.
- [ ] Re-executar a mesma criação (mesmo email) **não** cria conta duplicada nem falha
      (idempotência via `getUserByEmail`).
- [ ] Editar `clientAccess` de um usuário existente re-emite o claim `clientIds`
      correspondente na mesma chamada.
- [ ] `resetLink` nunca aparece em GET `/api/users` nem em respostas de edição.

---

## 3. RBAC — papel `clientAdmin` (admin por-tenant)

### 3.1 Modelo do papel
- Novo campo **no doc** `users/{id}.adminClientIds: string[]` — o conjunto de tenants que
  o usuário pode administrar. Vazio (ou ausente) para usuário comum.
- **Não** é preciso mirror em claim: o gate de `POST /api/users` roda server-side e lê o
  doc do chamador (como `verifyClientAccess` já faz, `api-auth.ts:195-202`). Manter o
  poder de provisionamento **fora** do token evita que ele dependa do refresh de 1h e
  segue ADR-0006 §1 ("`clientId` server-bound, cross-check, nunca confiado do request").
- Admin global continua sendo `isAdminEmail(email)` (`runtime-config.ts:32-35`) **ou**
  claim `role==='admin'` (paridade com `require-admin.ts:57-64`).

### 3.2 Novo gate de `POST /api/users`
Novo helper server-side (proposto): `verifyCanProvision(callerEmail, target)` em
`src/shared/lib/api-auth.ts` (ou módulo `permissions/provision.ts`), retornando
`{allowed, error?, status?}` no mesmo padrão dos demais `verify*`.

```
globalAdmin = isAdminEmail(callerEmail) || callerRole === 'admin'
if globalAdmin: allow (qualquer target)               // caminho atual preservado

// clientAdmin:
callerDoc = users where email==callerEmail            // fail-closed se ausente → 403
callerAdminOf = callerDoc.adminClientIds ?? []
if callerAdminOf.empty: 403

targetTenants = target.clientAccess.map(clientId)
ASSERTIVAS (todas fail-closed, negam se qualquer falhar):
 (a) targetTenants ⊆ callerAdminOf                      // não concede fora do escopo
 (b) target NÃO recebe admin global:
       !isAdminEmail(target.email)  &&  target.role !== 'admin'
 (c) (target.adminClientIds ?? []) ⊆ callerAdminOf     // sub-delegação só no próprio escopo
 (d) em EDIÇÃO: entradas de clientAccess / adminClientIds de tenants FORA de callerAdminOf
     no doc existente são preservadas intactas (merge por tenant, §3.3)
```

### 3.3 Edição sem escalonamento cross-tenant (merge por tenant)
Um clientAdmin de `{vila-rosa}` editando um usuário que também acessa `{om}` **não pode**
tocar a entrada `om`. O route, para caller não-global:
1. Lê o doc existente.
2. Calcula `preserved = existing.clientAccess.filter(ca => ca.clientId ∉ callerAdminOf)`.
3. `mutable = target.clientAccess.filter(ca => ca.clientId ∈ callerAdminOf)`.
4. Grava `clientAccess = preserved ∪ mutable`. Mesmo para `adminClientIds`.
5. Recalcula o claim `clientIds` sobre a união final.
Assim o clientAdmin nunca remove nem concede acesso fora do seu escopo, mesmo mandando um
body malicioso.

### 3.4 O que o clientAdmin NÃO pode (barreiras explícitas)
- (a) criar/tornar alguém admin global — bloqueado por 3.2(b): recusa `email` no domínio
  admin **e** `role==='admin'`. **Vetor crítico:** sem 3.2(b), um clientAdmin criaria
  `evil@askliquid.com`, que ganharia admin via `isAdminEmail` fallback.
- (b) criar/editar usuário em tenant fora do seu — 3.2(a) + 3.3.
- (c) conceder `clientAccess` a tenants que não administra — 3.2(a).
- (d) conceder rotas fora do permitido — rotas só têm efeito **por (cliente, rota)**
  (`authorize.ts:45-48`); como o clientAdmin só concede `clientAccess` a tenants do seu
  escopo, qualquer `group`/`routeOverride` fica confinado a esses tenants. Não é preciso
  restringir a lista de groups; a fronteira de tenant já contém o efeito.
- Também: clientAdmin **não** pode se auto-promover (não pode ampliar o próprio
  `adminClientIds` — 3.2(c) exige ⊆ do que já tem; e 3.3 preserva o resto).

### 3.5 Onde o papel é armazenado e verificado
- Armazenado: `users/{id}.adminClientIds` (Firestore, DB `liquid-play-dataviz`).
- Verificado: server-side no `POST /api/users` via `verifyCanProvision`. GET/DELETE
  também passam a aceitar clientAdmin com escopo (listar/excluir só usuários cujos
  `clientAccess ⊆ callerAdminOf`); DELETE preserva o guard de auto-exclusão (`:138-145`)
  e ganha guard de "não excluir usuário com acesso a tenant fora do escopo".

### Critérios de aceite §3
- [ ] clientAdmin de `{A}` cria usuário com `clientAccess=[A]` → 200; com
      `clientAccess=[A,B]` (B fora) → 403.
- [ ] clientAdmin cria `x@askliquid.com` → 403; define `role:'admin'`/`adminClientIds`
      fora do escopo → 403.
- [ ] clientAdmin edita usuário multi-tenant `[A,B]` (só admin de A): entrada B do doc
      permanece byte-idêntica após o save.
- [ ] admin global mantém 100% do comportamento atual (nenhuma regressão no caminho
      `isAdminEmail`).

---

## 4. Modelo do claim multi-cliente + migração das rules

### 4.1 Forma escolhida
- **`clientIds: string[]`** no custom claim (projeção de `clientAccess`, §2.4).
- Manter compat lendo **também** o `clientId` singular legado nas rules (usuários já
  provisionados por `grant-claims.ts` continuam funcionando até re-provisionamento).

Rejeitada a alternativa "derivar de `clientAccess` dentro da rule via `get(users/...)`":
o doc de usuário é indexado por slug de email (não por `uid`), `clientAccess` é array de
maps, e `get()` em rule custa leitura + acopla as coleções server-managed ao doc de
usuário. Frágil e caro. O claim projetado é mais simples e já é o padrão do repo.

### 4.2 Padrão de rule (fail-closed, com back-compat)
Helper novo, substituindo `tenantMatches()`:

```
function tenantAllowed(cid) {                          // cid = resource.data.clientId ou path var
  return request.auth != null && cid is string && (
     request.auth.token.clientId == cid               // legado singular
     || (request.auth.token.clientIds is list         // guarda: sem o claim → falso (deny)
         && cid in request.auth.token.clientIds)
  );
}
```

Aplicação por site (§1.6):
- Coleções server-managed (`workingMemory`, `embeddings*`, `sqlCatalog*`):
  `allow read: if isAdminEmail() || tenantAllowed(resource.data.clientId);`
- Subcoleções `clients/{clientId}/groups` e `.../reports` (read+write):
  `... || tenantAllowed(clientId)` (path var).
- `workingMemory/{t}/messages` (read): `... || tenantAllowed(resource.data.clientId)`.

**Fail-closed garantido:** sem `clientIds` (list) e sem `clientId` (string) batendo, a
condição é falsa → deny. A guarda `is list` evita erro de runtime (que também negaria) e
mantém o `||` seguro. Nenhum caminho **amplia** acesso: um usuário sem o claim novo
continua exatamente como hoje (só passa pelo `clientId` singular, se tiver).

### 4.3 Migração de usuários existentes
- Usuários com `clientId` singular antigo: **continuam funcionando** (rule lê os dois).
- Backfill one-time (§6, T6): para cada `users/{id}` com `clientAccess`, setar
  `clientIds = clientAccess.map(clientId)` no claim. Após backfill, o `clientId` singular
  pode ser deixado (inócuo) ou removido; a rule tolera ambos.
- `grant-claims.ts` (T5): aceitar `--clientIds=a,b,c` e passar a escrever `clientIds`
  (mantendo `--clientId` como alias que preenche `clientIds:[x]`).

### 4.4 Impacto em ADR-0009
- ADR-0009 governa `sqlCatalog`/`embeddingsSql` (rules `:112-131`), que hoje usam
  `tenantMatches()`. A troca para `tenantAllowed()` é **transparente** ao ADR-0009 (o
  isolamento por tenant permanece; só passa a aceitar um conjunto). Não requer ADR nova
  para o 0009 — apenas menção na ADR do §6.

### Critérios de aceite §4
- [ ] Usuário com `clientIds:['A','B']` lê `clients/A/groups/*` e `clients/B/groups/*`; é
      negado em `clients/C/*`.
- [ ] Usuário legado com apenas `clientId:'A'` continua lendo `clients/A/*` (nenhuma
      regressão).
- [ ] Usuário sem nenhum claim de tenant é negado em todas as coleções tenant-bound
      (fail-closed), inclusive quando `clientIds` está ausente.
- [ ] Escrita em coleções server-managed permanece `allow write: if false`.

---

## 5. Análise de segurança (vetores e como o design os fecha)

| # | Vetor | Fechamento |
|---|---|---|
| V1 | **Privilege escalation via clientAdmin** — conceder tenant fora do escopo, tornar-se/tornar outro admin global, editar cross-tenant | §3.2(a)(b)(c) + §3.3 merge por tenant, todas fail-closed; **inclui bloquear email no domínio admin** (senão `isAdminEmail` fallback promoveria) |
| V2 | **Token multi-cliente ampliando acesso indevido** — claim com tenant a mais que o doc | claim é **projeção** do doc (§2.4), emitido na mesma transação; API cruza sempre com o **doc** (defense-in-depth). Claim é assinado no JWT (usuário não altera). Guarda `is list` mantém rules fail-closed |
| V3 | **Reset-link vazando** — link concede tomada de conta | devolvido só a admin autorizado, só em create, só via resposta HTTPS; **nunca logado, nunca em GET/list, nunca persistido**; expira (default Firebase ~1h) e é single-use; Google-only não recebe link |
| V4 | **Claim vs doc dessincronizados** | ordem create→claim→doc com abort se claim falha (doc nunca "à frente" do claim); idempotência re-sincroniza; rule tolera legado; refresh de token (≤1h) documentado (usuário re-loga) |
| V5 | **Conta órfã / doc órfão** — createUser sem doc, ou doc sem conta | conta sem doc = fail-closed na API (nega tudo); doc sem conta = usuário simplesmente não loga (estado atual). Nenhum concede acesso |
| V6 | **IDOR de listagem/exclusão por clientAdmin** | GET/DELETE passam a filtrar por `callerAdminOf`; DELETE mantém guard de auto-exclusão (`:138-145`) e nega alvo com tenant fora do escopo |
| V7 | **Regressão do isolamento (ADR-0006)** | nenhuma rule fica mais permissiva; teste adversarial cross-tenant (§6, T8) é gate de merge, alinhado ao gate zero-recall do ADR-0006 §7 |

---

## 6. ADR nova — recomendação

**Recomendação: SIM, criar `ADR-0018`.** Justificativa: multi-cliente por usuário altera
o modelo de tenancy do **ADR-0006 §1** (origem do `clientId`: *singular* server-bound → um
**conjunto** `clientIds` por principal) e introduz um **papel novo** (`clientAdmin`) e um
fluxo de **provisionamento self-service**. Isso é uma decisão arquitetural com trade-offs
reais → é ADR (critério `adrs/README.md:56-58`).

**Relação com ADR-0006:** `related: [0006, 0009]`, **não** `supersedes`. ADR-0006 cobre
muito além do escopo do `clientId` (RAG, working memory, BQML, PII, gate adversarial) que
**permanece válido**; um `supersedes: 0006` (que o template trata como substituição total)
seria incorreto. A ADR-0018 **refina** o ADR-0006: §1 (origem → conjunto) e §8
(fail-closed → guarda de array/`is list`), mantendo todas as garantias de isolamento. Se
os deciders preferirem semântica estrita de supersede parcial (não suportada pelo
template), a alternativa é uma nota de status em 0006 apontando a 0018; recomendo a via
`related` + seção "Relação com ADR-0006/0009" na 0018.

**Esboço da ADR-0018:**
- **Título:** "Tenancy por-usuário como conjunto (`clientIds[]`) + provisionamento
  self-service e papel `clientAdmin`".
- **Decisão:** (1) principal pode pertencer a N tenants; claim `clientIds: string[]` é
  projeção read-only do doc `clientAccess`; rules aceitam o conjunto (com compat singular);
  (2) `POST /api/users` provisiona credencial (Admin SDK) + claim + doc numa ação
  (Abordagem A); (3) papel `clientAdmin` (`users.adminClientIds`) provisiona apenas
  usuários do(s) seu(s) tenant(s), sem escalonar; (4) doc continua fonte de verdade, claim
  é derivado.
- **Status inicial:** `Proposed`. Numeração: **0018** (0017 é o maior atual,
  `adrs/README.md:107`).

---

## 7. Decomposição em tasks (subagent-driven)

Ordem e dependências. **⚠ = alto risco (rules/claim/RBAC) → verificação adversarial
obrigatória.**

| ID | Task | Depende | Risco | Testável por |
|---|---|---|---|---|
| T0 | Escrever **ADR-0018** (`adrs/decisions/0018-...md`, status Proposed) + atualizar índice `adrs/README.md` | — | baixo | revisão humana |
| T1 ⚠ | **Rules multi-cliente**: introduzir `tenantAllowed()` e aplicar nos 6 sites (§1.6/§4.2), com back-compat singular e guarda `is list` | T0 | **alto** | testes de rules em emulador (allow/deny por tenant, legado, ausência de claim) |
| T2 | **Route create+claim (Abordagem A)**: `getUserByEmail`-idempotente, `createUser`, `setCustomUserClaims({clientIds})`, `generatePasswordResetLink`, resposta com `resetLink` (§2) | T0 | médio | teste de integração da rota (create/edit/idempotência; resetLink só em create) |
| T3 ⚠ | **RBAC clientAdmin**: campo `adminClientIds`, helper `verifyCanProvision`, gate em POST/GET/DELETE, merge por tenant (§3) | T2 | **alto** | teste do gate (escopo, bloqueio domínio admin, preserve cross-tenant) |
| T4 | **UI**: `UserForm.tsx` (checkbox credencial, exibir resetLink, campo adminClientIds só p/ admin global) + `useAdminUsers.ts` (repassar/retornar body) (§2.5) | T2, T3 | baixo | render/UX + e2e leve |
| T5 | **`grant-claims.ts`**: suportar `--clientIds=a,b`, alias `--clientId` → `[x]` (§4.3) | T1 | baixo | execução manual/`--list` |
| T6 | **Backfill** one-time: para cada `users/*` com `clientAccess`, setar claim `clientIds` (§4.3) | T1 | médio | dry-run + verificação de amostra |
| T7 ⚠ | **Verificação adversarial** end-to-end: cross-tenant SDK-direto + escalonamento clientAdmin (§5 V1-V7); gate de merge (paridade ADR-0006 §7) | T1, T3 | **alto** | suíte adversarial dedicada |

**Sequência crítica:** T0 → T1 → T2 → T3 → T4; T5/T6 após T1; T7 fecha validando T1+T3.
T1 e T3 são os pontos onde um erro **amplia** acesso — merecem TDD adversarial (red antes
de green) e revisão humana explícita.

---

## 8. Questões em aberto

1. **`role` no token para clientAdmin?** O design mantém `clientAdmin` **fora** do token
   (só doc). Se algum caminho futuro de client SDK precisar distinguir clientAdmin nas
   rules, aí sim adicionar claim — hoje é desnecessário e adiciona superfície. Confirmar
   que nenhum consumo de rule precisa disso.
2. **Expiração/entrega do reset-link.** Sem e-mail transacional, o link é copiado pelo
   admin. Aceitável para DoD-1? Ou prever um "gerar novo link" na UI (o link expira em
   ~1h)? Decidir se a UI persiste o último link (recomendação: **não** persistir).
3. **Remoção do `clientId` singular.** Após o backfill (T6), depreciar de vez o claim
   singular e simplificar a rule, ou manter compat indefinidamente? (impacto em
   `grant-claims.ts`).
4. **`createUser` sem senha para fluxo email/senha.** Confirmar o comportamento desejado
   (conta existe, login por senha só após reset-link) vs. gerar senha aleatória
   descartável. Recomendação: sem senha + reset-link.
5. **Escopo de GET/DELETE para clientAdmin.** Confirmar se clientAdmin deve **listar** só
   usuários do seu escopo (recomendado) — hoje GET lista todos (`route.ts:19`).
6. **`supersedes` vs `refines` no ADR-0018.** O template só formaliza `supersedes` (total).
   Confirmar com deciders a via `related`+seção de relação (recomendada) para não invalidar
   o restante do ADR-0006.
7. **Sincronização em edições fora do provisionamento.** Se algum fluxo futuro alterar
   `clientAccess` sem passar pelo `POST /api/users` (ex.: script), o claim `clientIds`
   dessincroniza. Manter o `POST /api/users` como **único** ponto de escrita de
   `clientAccess`+claim (ou re-emitir claim em qualquer writer).
