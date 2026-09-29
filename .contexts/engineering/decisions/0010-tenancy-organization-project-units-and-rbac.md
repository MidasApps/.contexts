# 0010. Tenancy e acesso: Organização → Projeto → Unidades, RBAC por nó sem deny

- **Status:** accepted
- **Date:** 2026-09-29
- **Deciders:** projeto DDC / spec do core agêntico (`docs/superpowers/specs/2026-09-29-agentic-app-core-design.md`, D4, D8, D9, §4, §7, §8)
- **Tags:** `engineering`, `tenancy`, `auth`, `rbac`, `security`, `firestore`, `storage`, `mastra`
- **Supersedes:** em parte a [0009](0009-runtime-topology-next-v1-functions-events-mastra-cloud-run.md): só o trecho "validado de novo pelo `@mastra/auth-firebase` com `authorizeUser`" da regra "Chat e execução de agente". O Mastra valida o token do usuário com um provider próprio (seção "Auth do servidor Mastra"). O resto da regra continua valendo: duas credenciais e `authorizeUser` checando a membership.
- **Complements:** [0004](0004-latest-stable-baseline-and-documented-exceptions.md) (fecha a pendência de `firebase-admin` 13.x sem exceção nova), [0007](0007-desktop-and-mobile-shell-with-tauri-2.md) (autenticação do desktop no `/v1`), [0008](0008-data-stores-split-firestore-postgres-storage-bigquery.md) (upload e audit log) e [0005](0005-firestore-document-ids-use-automatic-ids.md) (IDs dos documentos de acesso).

## Context

O core é multi-tenant desde a v1 e genérico: não conhece o domínio das aplicações derivadas. A spec fixa quatro pontos:

- **D4:** Organização (tenant) → Projeto → árvore opcional de Unidades, com tipos definidos pela aplicação. Papéis são atribuídos por nó e herdados para baixo. Um usuário pode estar em várias organizações.
- **D8:** o cliente não escreve no Firestore. Toda mutação passa pelo `/v1`.
- **D9:** RBAC sem deny explícito na v1.
- **§4:** quatro principals (`user`, `device`, `service`, `platform staff`). As claims são só projeção. Permissões no formato `<module>.<resource>.<action>`. `authorize()` é a única função de decisão. Existem permissões `requiresApproval`, e o agente tem teto de permissões.

`contracts/firebase-firestore.md` §7 manda documentar em `rules/tenancy.md` qualquer modelo diferente do default "um `tenantId` por documento = um claim no token". Um usuário em várias organizações e papéis por nó são esse caso.

Pontos que outras ADRs deixaram para esta:

1. **`firebase-admin` duplicado.** `@mastra/auth-firebase@1.1.2` declara `firebase-admin ^13.7.0` como dependency, ao lado do baseline 14.5.0 (invariante 8 de `MEMORY.md`).
2. **Autenticação do desktop no `/v1`** e onde o token fica guardado (0007).
3. **Como o Mastra autoriza** a chamada que o `/v1` encaminha (0009).
4. **Como o upload é autorizado** no Cloud Storage (0008).
5. **Onde fica o audit log** (0008).

Fatos medidos em 2026-09-29:

- **`@mastra/auth-firebase@1.1.2`** (`npm pack` e leitura do `dist/`). Importa o namespace `admin` de `firebase-admin`. Chama `admin.apps.length`, `admin.initializeApp({ credential: admin.credential.cert(...) | admin.credential.applicationDefault() })` e `admin.auth().verifyIdToken(token)`, sem `checkRevoked`. O `authorizeUser` default só aceita o usuário se existir o documento `/user_access/{uid}`, o que não corresponde ao modelo deste core. A opção `authorizeUser` do construtor substitui esse default.
- **`firebase-admin` 14.0.0** (release notes, 2026-06-08) removeu o suporte ao namespace legado ("Remove Deprecated Legacy Namespace Support"), removeu o Instance ID e os tipos legados do FCM, deixou de suportar Node 18 e 20 e passou a compilar para ES2021. O `lib/index.d.ts` da 14.5.0 exporta só `initializeApp`, `getApp`, `getApps`, `deleteApp`, `cert`, `applicationDefault`, `refreshToken`, os tipos e `SDK_VERSION`. Não existem `apps`, `auth()` nem `credential`.
- **`@mastra/core@1.71.0`** exporta `MastraAuthProvider` (classe abstrata com `authenticateToken(token, request)` e `authorizeUser(user, request)`), `IMastraAuthProvider`, `CompositeAuth` e `SimpleAuth` em `@mastra/core/server`. `server.auth` aceita a interface estrutural, então um provider escrito pelo projeto é aceito como qualquer pacote oficial. `mapUserToResourceId(user)` grava o resource ID derivado no request context. O guia de autenticação diz que o Mastra "ignores a conflicting resource ID supplied by the client" (`mastra.ai/docs/guides/authentication-identity`). As chaves reservadas são as constantes `MASTRA_RESOURCE_ID_KEY` (`"mastra__resourceId"`) e `MASTRA_THREAD_ID_KEY` (`"mastra__threadId"`), exportadas por `@mastra/core/request-context` (lidas no `dist/` da 1.71.0).
- **Custom claims** do Firebase Auth têm limite de 1000 bytes e só chegam ao cliente quando o ID token é renovado.

## Decision Drivers

- **Fail-closed verificável.** Sem grant explícito, o acesso é negado, e isso tem teste (`@firebase/rules-unit-testing` e testes de `authorize()`).
- **Uma função de decisão.** `/v1`, Functions, Mastra e tools de agente perguntam à mesma função. A política não se duplica.
- **Claims pequenas e nunca fonte de concessão.** A fonte de verdade está no Firestore, escrita só pelo servidor (D8).
- **Revogação rápida.** Tirar um papel produz efeito sem esperar o ID token expirar (até 1 h).
- **Leitura em tempo real** pelo cliente com Security Rules (0008), com custo de `get()` limitado por request.
- **Genérico.** Tipos de Unidade, módulos e papéis custom são da aplicação. O core só conhece nós, papéis e permissões.
- **Uma versão por dependência no workspace** (invariante 8) e baseline no `latest` (0004).

## Considered Options

### A. Modelo de autorização

A1. **Claims como fonte de permissão.** Papéis e permissões vão para o token; Rules e servidor leem o token.
A2. **Fonte de verdade no Firestore + projeções.** `memberships` e `roles` são a verdade. `access/{tenantId}_{uid}` é a projeção que as Rules leem. As claims carregam só organização ativa, papel de staff e versão de acesso.
A3. **Motor de autorização externo** (ReBAC no estilo Zanzibar, por exemplo OpenFGA ou SpiceDB).

### B. `firebase-admin` 13.x trazido por `@mastra/auth-firebase`

B1. **Exceção E7 na 0004.** Aceitar as duas cópias (13.x do pacote, 14.5.0 do workspace).
B2. **`pnpm.overrides` forçando 14.5.0**, validado por teste de integração.
B3. **Não adotar o pacote.** Provider próprio `extends MastraAuthProvider`, com o `firebase-admin` 14.5.0 do workspace.

### C. Upload para o Cloud Storage

C1. **Storage Rules com escrita do cliente** limitada por tenant e tamanho.
C2. **Signed URL V4 emitida pelo `/v1`** depois do `authorize()`. Storage Rules negam todo acesso do cliente.

## Pros and Cons of the Options

**A1. Claims como fonte**
- \+ Nenhuma leitura extra: as Rules e o servidor leem o token.
- − Estoura 1000 bytes com poucos nós e papéis. Usuário em várias organizações multiplica o problema.
- − Revogação espera o token expirar (até 1 h) ou exige `revokeRefreshTokens` para cada mudança de papel.
- − Contraria `contracts/firebase-firestore.md` §7: claim é projeção, nunca origem de concessão.

**A2. Firestore + projeções**
- \+ A verdade fica num lugar escrito só pelo servidor. Claims ficam em poucos campos fixos.
- \+ Revogação: o trigger regrava a projeção e incrementa `accessVersion`. A Rule compara a versão do token com a da projeção e nega no próximo request.
- − Uma projeção a manter por trigger, com consistência eventual (segundos). Mudança num papel custom reprojeta todos os membros que o usam.
- − Cada leitura protegida por Rule custa um `get()` da projeção.

**A3. Motor externo**
- \+ Relações arbitrárias, consultas "quem pode", auditoria de política pronta.
- − Mais um serviço com estado, backup e SLA, fora do Emulator Suite. Quebra a paridade local (D10).
- − As Security Rules não chamam serviço externo: a leitura em tempo real do cliente precisaria de outra projeção de qualquer forma.
- − O modelo da v1 (árvore, herança para baixo, sem deny) cabe em A2.

**B1. Exceção E7**
- \+ Nada a escrever.
- − Duas cópias de `firebase-admin` no mesmo processo, cada uma com a própria app default e o próprio cliente de Firestore. O pacote chama `initializeApp` na 13.x com `applicationDefault()` por conta própria.
- − A 13.x está uma major atrás do baseline sem incompatibilidade nossa que justifique. O `authorizeUser` default (`/user_access/{uid}`) teria de ser substituído de qualquer forma, e ele é quase todo o valor do pacote.

**B2. `pnpm.overrides` para 14.5.0**
- − **Inviável, sem precisar de teste:** o pacote usa `admin.apps`, `admin.credential.*` e `admin.auth()`, que a 14.0.0 removeu. Com o override, o módulo quebra ao carregar (`admin.credential` é `undefined`) e o tipo `admin.auth.DecodedIdToken` deixa de existir.

**B3. Provider próprio**
- \+ Uma cópia de `firebase-admin` (14.5.0) no workspace; nenhuma exceção na 0004.
- \+ O provider chama o mesmo `authorize()` do `/v1`, em vez de uma coleção `user_access` paralela.
- \+ `verifyIdToken(token, checkRevoked)` sob nosso controle.
- − Um arquivo pequeno a manter contra a API de `MastraAuthProvider`. A API é pública e estável na 1.x e tem testes nossos.

**C1. Storage Rules com escrita do cliente**
- \+ Upload direto pelo SDK, com progresso nativo.
- − Viola D8: a escrita não passa pelo `/v1`, e a validação de quota, permissão por nó e tipo de arquivo fica dividida entre Rules e servidor.

**C2. Signed URL pelo `/v1`**
- \+ Passa pelo pipeline completo (auth → validate → authorize → act). O path é gerado no servidor.
- \+ Rules de Storage ficam em `allow read, write: if false`.
- − Exige `iam.serviceAccounts.signBlob` para o service account do `apps/web`. Progresso de upload fica por conta do `fetch`/XHR.

## Decision Outcome

**A2 + B3 + C2.** As regras imperativas que aplicam esta decisão ficam em `@.contexts/engineering/rules/tenancy.md`, e os termos em `@.contexts/business/glossary.md`.

### Modelo

- **Nós:** `organizations` (o tenant; `tenantId` = ID do documento da organização), `projects` e `units`. São coleções top-level com `tenantId`. Todo nó e todo recurso protegido guardam `nodePath`, a lista de IDs do próprio nó e dos ancestrais, da organização até ele. Unidades apontam o pai por `parentId`. O tipo da Unidade (`unitType`) é declarado pela aplicação. A profundidade é limitada para que `nodePath` e a projeção caibam no orçamento de `get()` e de tamanho de documento; o limite numérico fica no contrato de dados do contexto `tenancy`.
- **Grants:** `memberships/{autoId}` = `principalType` (`user` ou `device`) + `principalId` (uid do Firebase Auth) + nó + papéis (`roleIds`) + `status`. Um Membro (principal `user`) pode ter grants em vários nós da mesma organização. Um Dispositivo tem exatamente um grant, no nó de ativação, com o papel de sistema `device`, e não é chamado de Membro. API keys não usam `memberships`: o escopo fica no próprio documento de `api-keys`.
- **Papéis:** `roles/{autoId}`. Papéis de sistema (`owner`, `admin`, `member`, `viewer` e `device`, este só para Dispositivo) são definidos pelo core. Papéis custom são por tenant e só combinam permissões declaradas nos manifestos.
- **Permissão:** `<module>.<resource>.<action>`, segmentos em minúsculas e kebab-case (`core.api-keys.create`), declarada no manifesto do módulo (`defineModule()`, contrato na SP0a Task 7). O core usa o módulo `core`.
- **Herança:** um grant num nó vale para todos os descendentes. A permissão efetiva num nó é a **união** dos grants no nó e nos ancestrais. Não existe deny (D9).
- **`authorize()`** em `services/access` é a única função de decisão. Lê a fonte (`memberships`, `roles`, `devices`, `api-keys`), nunca as claims nem a projeção. É fail-closed e é usada por `/v1`, Functions, Mastra e tools.

### Claims e projeção

- **Claims** (≤ 1000 bytes, só projeção): `tenantId` (organização ativa), `platformRole` (`staff`, só para staff), `accessVersion` (inteiro), e `principalType`/`nodeId` no token de `device`.
- **`access/{tenantId}_{uid}`** (ID natural composto, 0005 item 2): projeção para as Rules. Contém `tenantId`, `uid`, `accessVersion` e `readNodeIds` (mapa `<module>.<resource>` → IDs de nós onde o principal tem `.read` por grant direto). Existe para todo principal que se autentica no Firebase Auth e lê o Firestore em tempo real: `user` e `device` (o `uid` do device é o do custom token). Um trigger em `apps/functions` a mantém quando `memberships` ou `roles` mudam. O trigger é idempotente e incrementa `accessVersion`. Quando o tenant alterado é o ativo, regrava as claims por **read-modify-write**: lê as claims atuais (`getUser(uid).customClaims`), troca só `accessVersion` e preserva `tenantId`, `platformRole` e as claims de device, porque `setCustomUserClaims` substitui o objeto inteiro. Se o `tenantId` atual já não é o tenant alterado, o trigger não mexe nas claims.
- **Troca de organização:** `PUT /v1/me/active-organization` confere a membership na fonte, regrava as claims e devolve `204`. O cliente força `getIdToken(true)`. No web, o cookie de sessão é emitido de novo.

### Principals

| Principal | Credencial no `/v1` | Escopo | Revogação |
|---|---|---|---|
| `user` | `Authorization: Bearer <Firebase ID token>` no `/v1` (web e desktop). Cookie de sessão do web só em RSC e Server Actions (ver "Web: cookie de sessão e CSRF") | grants em `memberships` | remover o grant (vale no request seguinte, porque `authorize()` lê a fonte; nas Rules, pela projeção + `accessVersion`); conta: `revokeRefreshTokens` |
| `device` | ativado por código de uso único em `POST /v1/devices/activations` (≥ 40 bits de entropia, hash no servidor, TTL de 10 min, lockout após 5 falhas, ver "Rate limits"), que devolve um custom token Firebase com `principalType: "device"`, `tenantId` e `nodeId`; depois o device usa o ID token como qualquer principal Firebase | um grant em `memberships` no nó de ativação, papel de sistema `device`; projeção `access` própria | `devices.status = revoked` + grant removido + `revokeRefreshTokens` |
| `service` | API key opaca em `Authorization: Bearer`, reconhecida pelo prefixo; guardada como hash SHA-256, comparada com `timingSafeEqual`, `expiresAt` obrigatório | um nó + lista explícita de permissões. **A cada uso**, a permissão efetiva é a interseção entre o escopo da chave e os grants **atuais** do criador (`createdBy`) no nó | `api-keys.status = revoked`; remover a membership do criador na organização revoga automaticamente as chaves dele (trigger), e a interseção já nega antes disso |
| `platform staff` | ID token com `platformRole: "staff"` projetado de `platform-staff/{uid}`; `verifyIdToken(token, true)`; MFA verificado no servidor pela presença de `firebase.sign_in_second_factor` no token decodificado (ausente → `403`) | só `/admin`; nenhum acesso a dados de tenant | remover de `platform-staff` + `revokeRefreshTokens` |

- **Impersonação** (staff vendo um tenant como um usuário): exige motivo, dura no máximo 60 min, é **somente leitura** na v1 e gera audit no tenant e na plataforma (ver "Audit log"). A UI mostra que a sessão é impersonada. Mutação durante a impersonação é negada.

### Verificação de token

- **Mutação no `/v1`** (`POST`, `PUT`, `PATCH`, `DELETE`): `verifyIdToken(token, true)` (`checkRevoked`). Conta desativada ou refresh tokens revogados → `401`.
- **Leitura no `/v1`:** `verifyIdToken(token)` sem `checkRevoked`. A revogação de acesso vale do mesmo jeito, porque `authorize()` lê a fonte (`memberships`, `roles`, `devices`, `api-keys`) em todo request.
- **Servidor Mastra:** `verifyIdToken(token, true)` em toda chamada, porque execução de agente pode chamar tool de mutação.
- **`/admin`:** `verifyIdToken(token, true)` + MFA (tabela acima).

### Web: cookie de sessão e CSRF

Refinamento explícito de `contracts/api.md` §12 (ADR 0003: vence o documento mais específico):

- O `/v1` aceita **só** `Authorization: Bearer` e ignora cookie. Sem credencial ambiente, o `/v1` não é alvo de CSRF.
- O web usa um cookie de sessão Firebase (`createSessionCookie`) **só** para RSC e Server Actions: `HttpOnly`, `Secure`, `SameSite=Lax`, verificado com `verifySessionCookie(cookie, true)`. A proteção de CSRF das Server Actions é a checagem de origem embutida no Next (rule `security` §7). Não se desliga, e Route Handler nenhum lê esse cookie.
- Trocar de organização emite o cookie de novo. Logout revoga no servidor (`revokeRefreshTokens`) e apaga o cookie (rule `security` §2).

### Rate limits

Aplicam `rules/security.md` §8 (chave `uid` + IP quando há principal; IP + identificador do recurso quando não há; `429` com `Retry-After`):

- `POST /v1/devices/activations`: código com ≥ 40 bits de entropia, uso único, TTL de 10 min. Lockout do código após 5 falhas e limite por IP. Cada falha é auditada.
- Verificação de API key: falhas limitadas por IP e por prefixo de chave. Depois do limite, `429` sem consultar o hash.
- `PUT /v1/me/active-organization`: limite por `uid`, porque cada chamada regrava claims e força renovação de token.
- **`requiresApproval`:** a permissão marcada no manifesto não executa direto. O `/v1` cria um pedido de aprovação, e outro principal com a mesma permissão no nó aprova. Quem pede não aprova o próprio pedido. O fluxo é genérico no contexto `access`, e a coleção e o contrato do pedido saem na SP que implementa o fluxo.
- **Teto do agente:** a permissão efetiva de uma tool é a **interseção** entre o que o usuário pode no nó e as permissões declaradas pelo agente. A confirmação humana de tool de mutação continua obrigatória (rule `security` §14). O contrato de agente é da SP0a Task 7.

### Autenticação do desktop

- O desktop envia `Authorization: Bearer <Firebase ID token>` ao `/v1`, como o web. O `/v1` aceita a origem da webview do Tauri numa allowlist de CORS (0007).
- O ID token fica só em memória e é renovado pelo SDK do Firebase Auth.
- O refresh token nunca vai para `localStorage` (rule `security` §2). O armazenamento persistente do desktop é o armazenamento seguro do sistema (Keychain, Credential Manager, Secret Service, Android Keystore), acessado por um port `shared/lib/secure-store` com adapter no `apps/desktop`.
- **Spike do SP0b:** qual adapter e como ligá-lo à persistência do SDK do Firebase Auth. Se nenhum caminho funcionar, guardar a sessão no IndexedDB da webview precisa de ADR novo com o risco registrado; não é um fallback silencioso.

### Auth do servidor Mastra

- `@mastra/auth-firebase` **não é adotado.** `packages/agents` tem um provider `extends MastraAuthProvider` (`@mastra/core/server`) registrado em `server.auth`:
  - `authenticateToken`: `getAuth().verifyIdToken(token, true)` do `firebase-admin` 14.5.0 do workspace;
  - `authorizeUser`: chama o use case de `services/access` exposto pelo `exports` de `@core/services`, que lê a **fonte** (`memberships`) e confere a membership ativa na organização do claim `tenantId`, como o `/v1`. Não lê a projeção `access` nem compara `accessVersion`: a projeção é só das Rules;
  - `mapUserToResourceId`: `` `${tenantId}:${uid}` ``, que prevalece sobre qualquer `resourceId` do cliente.
- Projeto, nó, locale e tela do `RequestContext` que chegam do `/v1` são cruzados com `authorize()` antes de o agente rodar. Nenhum ID de escopo vindo do corpo é confiado sem esse cruzamento.
- Execução de agente na v1 exige principal `user` ou `device`. Principal `service` chamando agente fica para o contrato de agentes (SP0a Task 7).
- O teste de integração do SP0b (spike Mastra) valida o provider contra o Auth Emulator. A decisão não depende dele: B2 é inviável pela API removida, não por comportamento a medir.

### Upload

- O recurso é o **arquivo**. `POST /v1/files`: auth → valida tipo declarado e tamanho → `authorize("core.files.create", nodeId)` → cria `files/{autoId}` com `status: "pending"` → responde `201` com `Location: /v1/files/{fileId}`. O corpo traz o arquivo e as instruções de upload: Signed URL V4 de `PUT` com validade de 15 min, `Content-Type` fixado e `x-goog-content-length-range`, no path `tenants/{tenantId}/files/{fileId}` gerado no servidor (rule `security` §16).
- `onObjectFinalized` (Functions) confere magic bytes e tamanho, marca `ready` ou apaga o objeto, e dispara a ingestão quando for o caso.
- Download: `GET /v1/files/{fileId}/download-url` devolve uma Signed URL V4 de `GET` de validade curta, depois do `authorize("core.files.read", nodeId)`.
- Storage Rules: `allow read, write: if false` em todo o bucket.
- Signed URL no Storage Emulator e o papel `signBlob` do service account do App Hosting: spike do SP0b.

### Audit log

- Store: coleção top-level **`audit-logs`** no Firestore, com `tenantId` (0008). Só o servidor escreve (Admin SDK). A leitura é pelo `/v1` (permissão `core.audit-logs.read`) ou pelo `/admin`.
- **Append-only é convenção no Firestore:** as Rules negam tudo ao cliente e nenhum código do core atualiza ou apaga, mas o Admin SDK ignora Rules e poderia reescrever. A cópia imutável verificável é o export para o BigQuery (tabela só de insert, 0008).
- **Eventos de plataforma** (grant de staff, início e fim de impersonação) vão para a coleção top-level `platform-audit-logs`, sem `tenantId`, com `targetTenantId` quando o evento toca um tenant. Impersonação grava nos dois lugares: em `platform-audit-logs` (`targetTenantId`) e em `audit-logs` com `tenantId` = tenant impersonado, `actor.principalType = "platform_staff"` e `onBehalfOf` = usuário impersonado.
- Campos: `tenantId`, `actor` (`principalType`, `id`), `onBehalfOf` (impersonação ou agente), `action` (a permissão), `resource` (`type`, `id`), `nodeId`, `outcome` (`allowed`, `denied`, `approved`, `rejected`), `requestId`, `traceId`, `occurredAt`. Sem PII além de IDs (rule `security` §13).
- Export para o BigQuery pelo caminho da 0008 (SP5). Retenção: definida por `business/compliance.md`. Enquanto aquele documento for template, não há TTL.
- Obrigatório auditar: mudança de grant, papel, API key e device; troca de organização; impersonação; decisão de `requiresApproval`; negação de `authorize()` em mutação; falha de ativação de device.

**Versões:** nenhuma linha nova na tabela de exceções da 0004. `@mastra/auth-firebase` sai do plano de dependências. O workspace tem uma só versão de `firebase-admin` (14.5.0), e a pendência da invariante 8 de `MEMORY.md` está fechada.

Por que não A1: não cabe em 1000 bytes e não revoga a tempo. Por que não A3: um serviço externo que as Rules não alcançam, sem ganho para a árvore sem deny. Por que não B1: duplica o SDK de admin para aproveitar um pacote cujo default de autorização seria trocado. Por que não B2: a 14.0.0 removeu a API que o pacote usa. Por que não C1: viola D8.

## Consequences

**Melhora:**
- Uma política de acesso, testável em memória (`authorize()`) e no emulator (Rules).
- Revogação de acesso no próximo request no servidor (fonte lida sempre) e nas Rules (`accessVersion`), sem esperar o token expirar. Revogação de conta em mutações pelo `checkRevoked`.
- O web e o desktop se autenticam do mesmo jeito no `/v1`.
- Um `firebase-admin` no workspace.
- Upload e download passam pelo mesmo pipeline das outras mutações.

**Piora:**
- Trigger de projeção a operar. Mudar um papel custom com muitos membros gera fan-out de reescrita (em lote e idempotente).
- Consistência eventual entre grant e projeção: por alguns segundos a Rule pode negar uma leitura recém-concedida. O servidor não é afetado porque lê a fonte.
- Todo recurso protegido carrega `nodePath`, e mover um nó na árvore regrava o `nodePath` dos descendentes (backfill idempotente, rule `migration`).
- A prova de query de lista com `hasAny` nas Rules precisa de teste. Toda query de lista filtra por `tenantId` e por `nodePath array-contains <nó concedido>`.
- Provider de auth do Mastra é código nosso, com teste contra a API de `MastraAuthProvider` a cada minor do `@mastra/core`.
- Impersonação somente leitura limita o suporte da v1.
- `authorize()` lê a fonte em todo request, e mutações e o Mastra pagam uma chamada de `checkRevoked` ao Auth: mais latência e leituras por request, mitigadas por cache só dentro do request.
- API key depende dos grants atuais do criador: a saída do criador desliga as integrações que ele criou, o que exige rotação planejada.

**Conflitos com documentos existentes (ADR 0003: vence o mais específico):**
- `contracts/firebase-firestore.md` §19 mostra `allow write` do cliente, e §22 mostra `organizations/{orgId}/members/{uid}`. Nos contextos do core valem D8 (Rules negam escrita) e `memberships` top-level, conforme `rules/tenancy.md`, que a própria §7 declara prevalente.
- `contracts/api.md` §12 prevê `POST /v1/auth/refresh` e cookie com `SameSite=Strict` + token CSRF explícito. No core: sem endpoint de refresh (a renovação do ID token é do SDK do Firebase Auth), `/v1` só com Bearer, e cookie `SameSite=Lax` só em RSC e Server Actions, com a checagem de origem do Next (seção "Web: cookie de sessão e CSRF"). A §12 ganha nota apontando para cá; a limpeza do endpoint é da SP0a Task 6.

**Pontos em aberto (SP0b):**
- Adapter de armazenamento seguro no Tauri e ligação com a persistência do Firebase Auth.
- Signed URL V4 no Storage Emulator e `signBlob` do service account do App Hosting.
- Teste de Rules para queries de lista com `nodePath`.
- Validação do provider de auth do Mastra contra o Auth Emulator (substitui, no plano do SP0b, o item "`@mastra/auth-firebase` validando token do Auth Emulator").

**Arquivos que passam a mudar:**
- Novo `rules/tenancy.md`. `contracts/firebase-firestore.md` §7 aponta para ele; §19 e §22 do mesmo contrato e `contracts/api.md` §12 ganham nota curta apontando para esta ADR (ADR 0003).
- `business/glossary.md` ganha os termos do core.
- `MEMORY.md`: Rules (19), índice de ADRs e invariante 8. `stacks/VERSIONS.md`: linha de `@mastra/auth-firebase` (não adotado).
- `stacks/backend/cloud-run.md` (quem valida o `Authorization` no Mastra), `stacks/backend/firebase-platform.md` (claims e upload) e `stacks/desktop/tauri@2.md` (auth e token): trocam "ADR de tenancy (SP0a Task 5)" por esta ADR.
- 0009 recebe a linha `Superseded in part by:`, e o índice de `decisions/README.md` é atualizado.
- `.claude/rules/tenancy.md` (espelho): SP0a Task 10.

## References

- `docs/superpowers/specs/2026-09-29-agentic-app-core-design.md` §2 (D4, D8, D9), §4, §7, §8
- `@.contexts/engineering/rules/tenancy.md`, `@.contexts/engineering/contracts/firebase-firestore.md` (§7, §19, §22), `@.contexts/engineering/rules/security.md` (§2, §3, §10, §13, §14, §16), `@.contexts/engineering/contracts/api.md` (§7.1, §12)
- `@.contexts/engineering/stacks/backend/firebase-platform.md`, `@.contexts/engineering/stacks/backend/cloud-run.md`, `@.contexts/engineering/stacks/desktop/tauri@2.md`
- [0004](0004-latest-stable-baseline-and-documented-exceptions.md), [0005](0005-firestore-document-ids-use-automatic-ids.md), [0007](0007-desktop-and-mobile-shell-with-tauri-2.md), [0008](0008-data-stores-split-firestore-postgres-storage-bigquery.md), [0009](0009-runtime-topology-next-v1-functions-events-mastra-cloud-run.md)
- https://github.com/firebase/firebase-admin-node/releases/tag/v14.0.0 (namespace legado removido, Node 18/20 fora)
- https://mastra.ai/docs/guides/authentication-identity (`server.auth`, `mapUserToResourceId`, "ignores a conflicting resource ID supplied by the client")
- https://firebase.google.com/docs/auth/admin/manage-sessions (`checkRevoked`, `revokeRefreshTokens`) · https://firebase.google.com/docs/auth/admin/verify-id-tokens
- https://firebase.google.com/docs/auth/admin/custom-claims (limite de 1000 bytes; propagação na renovação do token)
- https://firebase.google.com/docs/auth/admin/manage-cookies (cookie de sessão)
- https://cloud.google.com/storage/docs/access-control/signed-urls · https://cloud.google.com/storage/docs/xml-api/reference-headers (`x-goog-content-length-range`)
