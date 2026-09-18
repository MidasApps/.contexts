---
title: Convenções de Modelagem — Firebase Firestore
type: contracts
scope: firestore
status: active
last_updated: 2026-05-20
---

# Convenções de Modelagem — Firebase Firestore

Este documento governa **como modelamos dados no Firestore**: estrutura de coleções, naming, IDs, hierarquia, audit, soft-delete, denormalização e segurança de schema. Capacidades técnicas e APIs do Firestore vivem em `@stacks/database/firebase-firestore`. Princípios agnósticos de modelagem de dados vivem em `@rules/data-modeling` — referenciados aqui sem duplicação.

Toda nova coleção, campo ou hierarquia DEVE consultar este contrato antes de ser criada.

---

## 1. Coleções

- Nomes em **kebab-case plural**: `users`, `chat-sessions`, `audit-logs`, `feature-flags`.
- **Nunca** singular (`user`, `chat-session`) — coleções representam conjuntos.
- **Nunca** `camelCase` ou `snake_case` em nomes de coleção.
- Subcoleção segue mesma regra: `users/{uid}/api-keys/{keyId}`.

### Exemplos

| Correto | Incorreto |
|---|---|
| `users` | `User`, `user`, `Users` |
| `chat-sessions` | `chatSessions`, `chat_sessions` |
| `audit-logs` | `auditLog`, `AuditLogs` |

---

## 2. Document IDs

A ordem de preferência para gerar IDs de documento é:

1. **ULID** (default) — ordenáveis lexicograficamente por tempo, sem hotspot inverso de auto-IDs e sem o hotspot frontal de timestamps puros. Use em entidades onde queries por recência sequencial agregam valor.
2. **Auto-ID do Firestore** — aceitável apenas quando o ID **não tem significado** para o consumidor e nunca aparece em URLs, exports ou referências cruzadas relevantes.
3. **UUID v4** — alternativa quando ordenação temporal é indesejada (ex: IDs que viajam para clientes não-confiáveis e cuja sequência não deve vazar volume de criação).
4. **ID natural** (ex: `uid` do Firebase Auth para `users/{uid}`) — quando a chave externa é estável e única.

### Anti-patterns de ID

- **Nunca** use timestamp puro no início do ID (`2026-05-20T...`) — gera hotspot de escrita por concentrar writes recentes na mesma faixa do índice B-tree.
- **Nunca** use IDs sequenciais (`1`, `2`, `3` ou `order-0001`) — mesmo problema de hotspot e vaza volume.
- **Nunca** use slugs livres de usuário como ID primário — use ID estável e mantenha slug como campo indexado mutável.

---

## 3. Hierarquia: subcoleção vs top-level

A escolha entre subcoleção e coleção top-level é doutrinal, não preferencial.

### Use **subcoleção** quando

- Os documentos são **fortemente owned** pelo documento pai e nunca consultados fora desse contexto: `users/{uid}/notifications/{notifId}`, `orders/{orderId}/line-items/{itemId}`.
- A vida útil dos filhos termina com a do pai (deleção em cascata semântica).
- Não há necessidade de query cross-pai frequente.

### Use **coleção top-level** quando

- A entidade é independente (`organizations`, `users`, `products`).
- Há queries cross-tenant ou cross-pai frequentes.
- O documento é referenciado por múltiplos pais.

### Use **collection group query** quando

- Precisa consultar uma subcoleção atravessando todos os pais (`collectionGroup("notifications").where("read", "==", false)`).
- DEVE declarar índice de collection group em `firestore.indexes.json`.
- Considere antes se a coleção não deveria ser top-level desde o início.

### Limite de profundidade

- Máximo recomendado: **3 níveis** de aninhamento (`a/{aId}/b/{bId}/c/{cId}`).
- Profundidade maior dificulta queries, security rules e exports. Se atingir 4 níveis, reformule.

---

## 4. Naming de campos

- **camelCase** sempre: `createdAt`, `userId`, `isActive`, `lastLoginAt`.
- **Plural** para arrays: `tags`, `permissions`, `memberIds`.
- **Singular** para escalares e maps: `email`, `address`, `metadata`.
- **Booleans positivos**: `isActive`, `isVerified`, `hasAccess` — evite `isNotDeleted`, `disabled`.
- IDs referenciais terminam em `Id` (singular) ou `Ids` (plural): `userId`, `organizationId`, `memberIds`.

### Anti-patterns

- `snake_case`, `PascalCase`, `kebab-case` em campos.
- `created_at`, `User_ID`, `is-active`.
- Booleans negativos (`isNotPublic`) — inverta a semântica.

---

## 5. Audit fields (obrigatórios)

Todo documento que represente entidade de negócio DEVE conter:

```
createdAt:  Timestamp    // FieldValue.serverTimestamp() no create
updatedAt:  Timestamp    // FieldValue.serverTimestamp() em todo write
createdBy:  string       // UID do ator ou "system" para writes automatizados
updatedBy:  string       // UID do ator do último update
```

### Soft delete

Quando a entidade tem requisitos de auditoria, recuperação ou referências externas, DEVE usar soft delete em vez de `delete()`:

```
deletedAt:  Timestamp | null   // null enquanto vivo
deletedBy:  string  | null
```

Queries de leitura DEVEM filtrar `deletedAt == null` (encapsule no converter ou repository). Hard delete é permitido apenas para entidades efêmeras (sessions expiradas, caches, logs com TTL).

---

## 6. Referências entre documentos

**Sempre** armazene o ID como **string**:

```
userId: "01HM8K..."        // correto
organizationId: "org_abc"  // correto
```

**Nunca** armazene `DocumentReference`:

```
userRef: db.doc("users/abc")   // proibido
```

### Por quê

- `DocumentReference` cria acoplamento ao path exato — refactor de hierarquia quebra todos os refs persistidos.
- Não serializa cleanly em JSON exports, BigQuery sinks ou Pub/Sub payloads.
- Force coupling com SDK do Firestore em consumidores que poderiam ser plain.

Refs em runtime são resolvidos no repository/converter via `db.collection("users").doc(userId)`.

---

## 7. Tenant isolation

Toda coleção top-level multi-tenant DEVE conter `tenantId` (ou `organizationId`, conforme o modelo de tenancy do projeto) em todo documento.

```
audit-logs/{logId}
  tenantId: "org_abc"
  actorUid: "..."
  action:   "USER_INVITED"
  ...
```

- `tenantId` participa de **toda query** relevante e de **todo composite index**.
- Security Rules DEVEM validar `resource.data.tenantId == request.auth.token.tenantId` (complementa `@rules/security`).
- Subcoleções sob `organizations/{orgId}/...` herdam isolamento pelo path e podem omitir o campo redundante.

---

## 8. Denormalização controlada

Cache de campos hot é permitido e encorajado para reduzir reads, desde que sincronizado:

```
posts/{postId}
  authorId:        "uid"
  authorName:      "Maria S."        // denormalizado de users/{uid}
  authorAvatarUrl: "https://..."     // denormalizado de users/{uid}
```

### Regras

- Cada campo denormalizado DEVE ter um **mecanismo de sync explícito**: Cloud Function trigger no source (`onUpdate` em `users/{uid}`) propagando para todos os destinos (referencie `@stacks/backend/firebase-functions`).
- DEVE documentar **staleness aceitável** no schema do projeto (segundos a minutos, normalmente).
- **Nunca** denormalize dados sensíveis (PII além do necessário, credenciais, permissões efetivas).
- Quando o custo de sync excede o de read direto, **não** denormalize.

---

## 9. Document size & particionamento

- Limite hard: **1 MiB por documento**.
- Limite operacional: **mantenha bem abaixo de 500 KiB**. Se aproximar, particione.

### Estratégia de particionamento

Para entidades grandes (mensagens longas, documentos com payload chunked):

```
messages/{msgId}             // metadata + preview
messages/{msgId}/chunks/{chunkId}   // conteúdo grande dividido
```

Para conjuntos crescentes, use subcoleção (ver seção 11).

---

## 10. Counters distribuídos

Firestore limita writes ao **mesmo documento** a ~1/segundo sustentado. Para contadores quentes (visualizações, métricas), use **sharded counters**:

```
counters/{name}
counters/{name}/shards/{shardId}
  count: number     // shard local
```

- N shards (tipicamente 10 a 100 conforme throughput esperado).
- Write incrementa um shard aleatório.
- Read soma todos os shards.
- Para counters frios (<1 write/s sustentado), documento único com `FieldValue.increment(1)` é suficiente.

---

## 11. Arrays vs subcoleções

### Arrays — use quando

- Conjunto **pequeno** (~< 100 elementos) e **bounded** semanticamente.
- Lido sempre junto com o documento pai.
- Imutável ou append-only de baixa frequência (`tags`, `permissions`, `memberIds`).

### Subcoleção — use quando

- Conjunto **crescente** ou ilimitado.
- Lido independentemente do pai (queries, paginação).
- Items têm identidade própria e audit fields.

### Regra prática

Toda query carrega o array **inteiro**. Se você precisa paginar, filtrar ou ordenar items individualmente — é subcoleção.

---

## 12. Maps aninhados

- Aceitável até **1-2 níveis** (`address.city`, `preferences.notifications.email`).
- Acima disso, queries com `where` em paths profundos ficam impraticáveis (não há wildcard de path) e índices viram problema.
- Se precisar consultar interior de map com flexibilidade, promova a subcoleção ou achate o schema.

---

## 13. Timestamps

- **Sempre** tipo `Timestamp` do Firestore. **Nunca** string ISO, **nunca** epoch number.
- **Sempre** UTC (Firestore armazena UTC nativamente; não armazene offset manualmente).
- **Sempre** `FieldValue.serverTimestamp()` em writes — nunca `new Date()` do cliente.
- Exibição em timezone local é responsabilidade do consumidor (app/UI), não do storage.

---

## 14. Enums

Strings em **SCREAMING_SNAKE_CASE**:

```
status: "ACTIVE" | "PENDING" | "SUSPENDED" | "DELETED"
role:   "OWNER" | "ADMIN" | "MEMBER" | "VIEWER"
```

### Evolução

- **Aditiva**: novos valores são adicionados; consumers DEVEM ter fallback para valor desconhecido.
- **Nunca** renomear valor existente em produção (quebra dados históricos).
- Para descontinuar, marque deprecated no schema e migre dados em script idempotente (referencie `@rules/migration`).

---

## 15. Money

Valores monetários DEVEM ser armazenados como **inteiro de centavos** (ou menor subunidade da moeda):

```
amountCents: 12345        // R$ 123,45
currency:    "BRL"        // ISO 4217
```

Firestore representa `number` como double IEEE 754 — precisão degrada em valores grandes ou após operações repetidas. Princípios de precisão decimal vivem em `@rules/data-modeling`.

---

## 16. Vector fields (embeddings)

Para embeddings inline em documentos:

```
embedding: VectorValue   // FieldValue.vector([0.12, -0.03, ...])
```

- Índice vetorial criado via `gcloud firestore indexes composite create --query-scope=COLLECTION --field-config field-path=embedding,vector-config='{"dimension":768,"flat":{}}'`.
- Use quando o caso é **RAG/recommend leve** acoplado ao mesmo documento Firestore.
- Para volumes grandes, latência crítica ou filtros vetoriais complexos, prefira **pgvector** (`@stacks/database/pgvector`). A escolha entre os dois é decisão de arquitetura, não de capricho.

---

## 17. Schema versioning

Documentos cujo schema é esperado evoluir DEVEM conter:

```
schemaVersion: number    // inicia em 1, incrementa em mudanças breaking
```

- Reads DEVEM tolerar `schemaVersion` desconhecida (forward compat) ou rejeitar explicitamente.
- Migrations entre versões são scripts idempotentes versionados no repo (referencie `@rules/migration`).
- **Nunca** faça migração ad-hoc via console.

---

## 18. Schemas no app (validation)

Todo documento Firestore DEVE ter **schema Zod** correspondente no app:

```
UserDoc     -> schemas/user-doc.ts
OrderDoc    -> schemas/order-doc.ts
```

- Use `withConverter<T>` para encapsular parse/serialize (`@stacks/database/firebase-firestore`).
- Convenções gerais de schema (naming, organização, exports) em `@contracts/schemas`.
- Regras de uso do Zod em `@stacks/validation/zod@4`.

Sem schema explícito, todo documento é `any` — proibido.

---

## 19. Security Rules

- `firestore.rules` é **versionado no repo** e revisado em PR.
- DEVE conter validação **básica de schema** como defense-in-depth: tipos esperados, campos required, `tenantId` matching token. Não substitui Zod no app — complementa.
- Princípios gerais de segurança em `@rules/security`.

```
match /users/{uid} {
  allow read:  if request.auth.uid == uid;
  allow write: if request.auth.uid == uid
            && request.resource.data.keys().hasAll(['createdAt','updatedAt','createdBy','updatedBy'])
            && request.resource.data.tenantId == request.auth.token.tenantId;
}
```

---

## 20. Indexes

- **Single-field**: criados automaticamente — não declare.
- **Composite**: declarados em `firestore.indexes.json`, versionados, deployed via CI.
- **Collection group**: declarados explicitamente com `queryScope: "COLLECTION_GROUP"`.
- **TTL**: declarado em `firestore.indexes.json` como `fieldOverrides` com `ttl: true`.

Deploy de query que precisa de composite index sem o índice declarado **falha**. Toda nova query composta passa por revisão do índice.

---

## 21. Eventos de domínio

Firestore writes **não são event bus**. Listeners e triggers servem para **side effects locais** (denormalization sync, audit, computed fields).

Para eventos de domínio que cruzam bounded contexts, use **Pub/Sub explícito** com contract de payload versionado (referencie `@contracts/events`). Triggers Firestore que publicam para Pub/Sub são padrão aceitável, mas o evento é o que está no Pub/Sub, não o write em si.

---

## 22. Exemplos canônicos de paths

| Path | Propósito |
|---|---|
| `users/{uid}` | Usuário (uid do Firebase Auth como ID) |
| `users/{uid}/notifications/{notifId}` | Notificações owned pelo usuário |
| `organizations/{orgId}` | Tenant |
| `organizations/{orgId}/members/{uid}` | Membership |
| `organizations/{orgId}/projects/{projectId}` | Projeto |
| `organizations/{orgId}/projects/{projectId}/tasks/{taskId}` | Task (3 níveis — limite) |
| `audit-logs/{logId}` | Log top-level com `tenantId`, `actorUid`, `action`, `resource`, `at` |
| `chat-sessions/{sessionId}` | Sessão de chat top-level |
| `chat-sessions/{sessionId}/messages/{msgId}` | Mensagem |

---

## 23. Anti-patterns (proibidos)

| Anti-pattern | Use |
|---|---|
| `DocumentReference` em campo | string ID + resolve no repository |
| Hard delete em entidade com audit | soft delete (`deletedAt`, `deletedBy`) |
| Array crescente >~100 items | subcoleção |
| `snake_case` ou `PascalCase` em campos | camelCase |
| IDs sequenciais ou timestamps puros | ULID / UUID v4 / Auto-ID |
| Counter incrementado sem shards (>1 write/s) | sharded counters |
| Hierarquia >3 níveis | reformule em top-level + `parentId` |
| Documento sem schema Zod (`any`) | Zod schema + `withConverter<T>` |
| Coleção multi-tenant sem `tenantId` | `tenantId` obrigatório + index composto |
| Audit fields ausentes | `createdAt`/`updatedAt`/`createdBy`/`updatedBy` |
| `createdAt` como string ISO | `Timestamp` UTC via `serverTimestamp()` |
| Composite index não declarado | `firestore.indexes.json` versionado |
| Firestore listener como event bus cross-context | Pub/Sub com contract (`@contracts/events`) |
| Money como float decimal | `amountCents: number` + `currency: "BRL"` |
| Singular ou camelCase em nome de coleção | kebab-case plural |
| Enum em camelCase ou rename de valor existente | SCREAMING_SNAKE_CASE + evolução aditiva |

---

## Referências cruzadas

- `@stacks/database/firebase-firestore` — capacidades técnicas e APIs do Firestore.
- `@stacks/backend/firebase-functions` — triggers usados para sync de denormalization.
- `@stacks/validation/zod@4` — schemas de validação no app.
- `@stacks/database/pgvector` — alternativa para embeddings em escala.
- `@rules/data-modeling` — princípios agnósticos de modelagem.
- `@rules/security` — princípios gerais de security e defense-in-depth.
- `@rules/migration` — scripts idempotentes de migração e schema versioning.
- `@contracts/schemas` — convenções de naming e organização de schemas Zod.
- `@contracts/events` — convenções de eventos cross-context via Pub/Sub.
