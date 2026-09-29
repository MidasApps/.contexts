---
title: Regras de Tenancy e Acesso
type: rules
status: active
scope: engineering
last_updated: 2026-09-29
related:
  - "@.contexts/engineering/decisions/0010-tenancy-organization-project-units-and-rbac.md"
  - "@.contexts/engineering/contracts/firebase-firestore.md"
  - "@.contexts/engineering/rules/security.md"
  - "@.contexts/engineering/rules/data-modeling.md"
  - "@.contexts/engineering/rules/api-design.md"
---

# Regras de Tenancy e Acesso

Regras imperativas de isolamento por tenant e de autorização no core: Organização → Projeto → Unidades, papéis por nó herdados para baixo, sem deny. Decisão e alternativas rejeitadas: `@.contexts/engineering/decisions/0010-tenancy-organization-project-units-and-rbac.md`. Termos (Organização, Nó, Membro, Papel, Permissão, Principal…): `@.contexts/business/glossary.md`.

Esta rule é o documento exigido por `@.contexts/engineering/contracts/firebase-firestore.md` §7 e **prevalece sobre aquela seção** para os contextos do core. Os invariantes do §7 continuam valendo e vêm primeiro: tenant server-bound, cross-check, claim como projeção, fail-closed.

Autenticação em geral, secrets e uploads: `@.contexts/engineering/rules/security.md`. Naming e campos obrigatórios: `@.contexts/engineering/rules/data-modeling.md`. Status e envelope de erro: `@.contexts/engineering/rules/api-design.md`.

---

## 1. Tenant server-bound

- **Sempre** derive o tenant efetivo do principal autenticado: claim `tenantId` do token, conferido contra a membership na fonte (`memberships`). Nunca o derive do corpo, da query nem do path.
- **Nunca** aceite `tenantId` vindo do cliente sem cross-check. Valor diferente do tenant efetivo → `404` quando a existência do recurso é sensível, `403` nos demais casos.
- **Sempre** atue numa organização por request: a ativa. Recurso de outra organização exige trocar a organização ativa antes.
- **Sempre** confira que o `tenantId` do recurso carregado é igual ao tenant efetivo, antes de devolver ou mutar.
- **Sempre** inclua `tenantId` em toda query de Firestore e em todo filtro de Postgres (`tenant_id`). Query sem tenant é bug de segurança, não de performance.
- **Sempre** use `tenantId` = ID do documento em `organizations`. Nunca crie um segundo identificador de tenant.
- **Nunca** use tenant do Identity Platform como Organização do core.

## 2. Claims são projeção

- **Sempre** limite as custom claims a `tenantId` (organização ativa), `platformRole` (`staff`), `accessVersion` e, no token de device, `principalType` e `nodeId`. Nada de papéis, permissões ou listas de nós.
- **Nunca** conceda acesso no servidor com base em claim. `authorize()` lê a fonte (`memberships`, `roles`, `devices`, `api-keys`).
- **Sempre** mantenha o payload de claims abaixo de 1000 bytes. Teste que falha acima disso.
- **Sempre** incremente `accessVersion` quando qualquer grant do principal no tenant muda, e regrave as claims quando o tenant alterado é o ativo.
- **Sempre** regrave claims por read-modify-write: leia `getUser(uid).customClaims`, troque só o campo que mudou e preserve os demais (`tenantId`, `platformRole`, claims de device). `setCustomUserClaims` substitui o objeto inteiro.
- **Nunca** escreva claims fora de `services/access` (use case) ou do trigger de projeção.

## 3. Fail-closed

- **Sempre** negue quando faltar grant, papel, projeção, `nodePath`, `tenantId` ou `accessVersion`. Ausência nunca é permissão.
- **Sempre** trate erro de leitura na checagem de acesso (timeout, documento ausente) como negação, com log de `warn`.
- **Nunca** escreva `authorize()` com default permissivo, `try/catch` que devolve `true` ou flag de bypass por ambiente.
- **Sempre** comece `firestore.rules` e `storage.rules` com negação total e abra só o necessário.
- **Sempre** responda `401` a principal não autenticado ou token inválido e `403` a principal autenticado sem permissão (`@.contexts/engineering/contracts/api.md` §7.1).

## 4. Uma função de decisão

- **Sempre** decida acesso com `authorize(principal, permission, nodeId)` de `services/access`. `/v1`, Functions, servidor Mastra e tools de agente chamam a mesma função.
- **Nunca** reimplemente checagem de papel em handler, componente, Rule de negócio ou tool (`if (user.role === "admin")`).
- **Sempre** chame `authorize()` depois de validar o input e antes de qualquer side effect: auth → validate → authorize → act.
- **Sempre** use o formato `<module>.<resource>.<action>`, em minúsculas e kebab-case por segmento: `core.api-keys.create`, `core.members.invite`. O módulo do core é `core`.
- **Nunca** use permissão não declarada em manifesto de módulo. Permissão desconhecida → negação.
- **Sempre** audite negação de `authorize()` em mutação (§9).

## 5. Árvore e herança

- **Sempre** grave `nodePath` (IDs da organização até o próprio nó) em todo nó e em todo recurso protegido.
- **Sempre** calcule a permissão efetiva como a **união** dos grants no nó e em todos os ancestrais.
- **Nunca** modele deny, exceção negativa ou "remover herança" na v1 (D9). Precisou restringir? Conceda num nó mais baixo em vez de no pai.
- **Sempre** guarde grants de `user` e `device` em `memberships` top-level (`tenantId`, `principalType`, `principalId`, nó, `roleIds`, `status`). Não use `organizations/{orgId}/members/{uid}` nos contextos do core.
- **Sempre** dê ao Dispositivo exatamente um grant, no nó de ativação, com o papel de sistema `device`. API key não tem `memberships`: o escopo fica no documento de `api-keys`.
- **Sempre** use papéis de sistema (`owner`, `admin`, `member`, `viewer`; `device` só para Dispositivo) antes de criar papel custom. Papel custom só combina permissões declaradas.
- **Sempre** mova um nó por backfill idempotente do `nodePath` dos descendentes (`@.contexts/engineering/rules/migration.md`).

## 6. Projeção `access` e Security Rules

- **Sempre** mantenha a projeção `access/{tenantId}_{uid}` para todo principal `user` e `device` (o `uid` do device é o do custom token).
- **Nunca** leia a projeção `access` nem compare `accessVersion` no servidor (`/v1`, Functions, Mastra): o servidor lê a fonte. A projeção é só das Rules.
- **Sempre** leia a projeção `access/{tenantId}_{uid}` nas Rules. Ela tem `tenantId`, `uid`, `accessVersion` e `readNodeIds` (`<module>.<resource>` → IDs de nós com `.read` por grant direto).
- **Nunca** escreva em `access` fora do trigger de projeção. O trigger é idempotente e roda em `apps/functions`.
- **Sempre** exija nas Rules: tenant do recurso = claim `tenantId`, `accessVersion` do token = da projeção, e `nodePath` do recurso com interseção nos nós concedidos.
- **Sempre** permita ao principal ler a própria projeção. É por ela que o cliente percebe o `accessVersion` novo e força `getIdToken(true)`.
- **Nunca** permita escrita do cliente em nenhuma coleção (D8). Toda mutação passa pelo `/v1`.
- **Sempre** filtre query de lista por `tenantId` e por `nodePath array-contains <nó concedido>`, e cubra a query com teste de Rules (`@firebase/rules-unit-testing`).

```
function access(tenantId) {
  return get(/databases/$(database)/documents/access/$(tenantId + '_' + request.auth.uid)).data;
}
function canRead(res, scope) {
  let a = access(res.tenantId);
  return request.auth != null
    && res.tenantId == request.auth.token.tenantId
    && a.accessVersion == request.auth.token.accessVersion
    && res.nodePath.hasAny(a.readNodeIds.get(scope, []));
}
match /projects/{projectId} {
  allow read: if canRead(resource.data, 'core.projects');
  allow write: if false;
}
match /access/{accessId} {
  allow read: if request.auth != null && resource.data.uid == request.auth.uid;
  allow write: if false;
}
```

## 7. Troca de organização

- **Sempre** troque a organização ativa por `PUT /v1/me/active-organization`, que confere a membership na fonte, regrava as claims e devolve `204`.
- **Sempre** force `getIdToken(true)` no cliente depois da troca, e emita de novo o cookie de sessão no web.
- **Nunca** troque de organização no cliente (estado local, header, parâmetro de rota) sem passar pelo `/v1`.
- **Sempre** audite a troca.

## 8. Principals

- **Sempre** identifique o ator pelo principal autenticado: `user` (ID token), `device` (custom token com `principalType: "device"`), `service` (API key) ou `platform staff`. Nunca por ID vindo do cliente.
- **Sempre** envie credencial ao `/v1` em `Authorization: Bearer`. Web e desktop enviam o ID token Firebase.
- **Nunca** guarde refresh token no `localStorage`. No desktop, a sessão persistente vai para o armazenamento seguro do SO pelo port `shared/lib/secure-store` (adapter: spike do SP0b).
- **Device:** ative só por código de uso único com ≥ 40 bits de entropia, guardado como hash, TTL de 10 min. Escopo = um nó. Revogue com `devices.status = revoked` + grant removido + `revokeRefreshTokens`.
- **Service (API key):** gere o segredo no servidor com `crypto.randomBytes`, mostre uma vez, guarde só o hash SHA-256 e compare com `timingSafeEqual`. `expiresAt` é obrigatório. Escopo = um nó + lista explícita de permissões.
- **Sempre** calcule a permissão de API key **a cada uso** como a interseção entre o escopo da chave e os grants **atuais** do criador no nó. Remover a membership do criador revoga as chaves dele (trigger).
- **Platform staff:** acessa só `/admin`, com `verifyIdToken(token, true)` e MFA conferido no servidor pela presença de `firebase.sign_in_second_factor` no token decodificado (ausente → `403`). Staff não tem acesso a dados de tenant fora da impersonação.
- **Impersonação:** exija motivo, limite a 60 min, só leitura na v1, banner visível na UI, audit no tenant e na plataforma. Negue toda mutação durante a impersonação.
- **Nunca** trate `platformRole: "staff"` como membro de organização.

## 8.1 Verificação de token e sessão web

- **Sempre** use `verifyIdToken(token, true)` (`checkRevoked`) em mutação do `/v1` (`POST`, `PUT`, `PATCH`, `DELETE`), em toda chamada ao servidor Mastra e no `/admin`. Leitura do `/v1` usa `verifyIdToken(token)`; a revogação de acesso vale porque `authorize()` lê a fonte.
- **Nunca** leia cookie no `/v1`. O `/v1` aceita só `Authorization: Bearer`, e por isso não é alvo de CSRF.
- **Sempre** use o cookie de sessão Firebase só em RSC e Server Actions: `HttpOnly`, `Secure`, `SameSite=Lax`, verificado com `verifySessionCookie(cookie, true)`. O CSRF das Server Actions é coberto pela checagem de origem do Next; nunca a desligue. Isto refina `@.contexts/engineering/contracts/api.md` §12 (ADR 0003).
- **Nunca** crie endpoint `/v1/auth/refresh`: a renovação do ID token é do SDK do Firebase Auth.

## 8.2 Rate limits

Aplicam `@.contexts/engineering/rules/security.md` §8 (`429` + `Retry-After`).

- **Sempre** limite `POST /v1/devices/activations` por IP e bloqueie o código após 5 falhas. Audite cada falha.
- **Sempre** limite falhas de verificação de API key por IP e por prefixo da chave. Acima do limite, responda `429` sem consultar o hash.
- **Sempre** limite `PUT /v1/me/active-organization` por `uid`.

## 9. Audit

- **Sempre** grave em `audit-logs` (top-level, com `tenantId`), só pelo servidor, append-only: nenhum update, nenhum delete, Rules negando tudo ao cliente. No Firestore isso é convenção (o Admin SDK ignora Rules); a cópia imutável é o export para o BigQuery.
- **Sempre** grave eventos de plataforma (grant de staff, impersonação) em `platform-audit-logs`, sem `tenantId` e com `targetTenantId` quando houver. Impersonação grava também em `audit-logs` com `tenantId` = tenant impersonado, `actor.principalType = "platform_staff"` e `onBehalfOf` = usuário impersonado.
- **Sempre** registre `actor` (`principalType`, `id`), `onBehalfOf`, `action` (a permissão), `resource`, `nodeId`, `outcome`, `requestId`, `traceId`, `occurredAt`.
- **Sempre** audite: mudança de grant, papel, API key e device; troca de organização; impersonação; decisão de `requiresApproval`; negação em mutação.
- **Nunca** grave PII além de IDs no audit (`@.contexts/engineering/rules/security.md` §13).

## 10. Aprovação e agentes

- **Sempre** transforme a execução de permissão `requiresApproval` em pedido de aprovação pelo fluxo genérico de `services/access`. Nunca execute direto.
- **Nunca** permita que o solicitante aprove o próprio pedido. Quem aprova precisa da mesma permissão no nó.
- **Sempre** calcule a permissão de uma tool de agente como a **interseção** entre as permissões do usuário no nó e as declaradas pelo agente.
- **Sempre** derive `resourceId` da memória do agente no servidor, como `` `${tenantId}:${uid}` `` (`mapUserToResourceId`). Nunca aceite `resourceId` do cliente.
- **Sempre** cruze projeto, nó e escopo do `RequestContext` com `authorize()` antes de o agente rodar.
- **Sempre** faça o `authorizeUser` do provider do Mastra ler a fonte (`memberships`), como o `/v1`.

## 11. Arquivos

- **Sempre** trate o arquivo como recurso: `POST /v1/files` responde `201` + `Location: /v1/files/{fileId}` com a Signed URL V4 de upload (15 min, `Content-Type` fixado, `x-goog-content-length-range`). O download é por `GET /v1/files/{fileId}/download-url`, com validade curta. Os dois passam antes pelo `authorize()`.
- **Sempre** gere o path no servidor: `tenants/{tenantId}/files/{fileId}`. Nunca use nome enviado pelo cliente.
- **Sempre** mantenha `storage.rules` em `allow read, write: if false`.
- **Sempre** confirme magic bytes e tamanho em `onObjectFinalized` antes de marcar o arquivo como `ready`.

## 12. Anti-patterns

- `where("tenantId", "==", body.tenantId)` sem cross-check → tenant do principal.
- Papel ou lista de permissões em custom claim → projeção `access` + `authorize()`.
- `if (process.env.APP_ENV === "local") return true` em `authorize()` → fake de ports no teste, nunca bypass.
- Rule `allow write: if request.auth.token.tenantId == ...` → escrita só pelo `/v1`.
- Deny explícito ("membro de tudo menos X") → grant no nó certo.
- `resourceId` do agente vindo do body → `mapUserToResourceId`.
- API key guardada em texto puro ou comparada com `===` → hash + `timingSafeEqual`.
- Staff lendo dados de tenant pelo `/admin` sem impersonação auditada.
- Upload direto no bucket pelo SDK do cliente → Signed URL do `/v1`.

## Referências cruzadas

- `@.contexts/engineering/decisions/0010-tenancy-organization-project-units-and-rbac.md` — decisão, alternativas e pontos em aberto.
- `@.contexts/engineering/contracts/firebase-firestore.md` — coleções, `tenantId`, Rules (§7, §19).
- `@.contexts/engineering/rules/security.md` — autenticação, autorização, uploads, logging.
- `@.contexts/engineering/stacks/backend/firebase-platform.md` — Auth, Storage, Emulator Suite.
- `@.contexts/engineering/stacks/desktop/tauri@2.md` — rede e token no desktop.
