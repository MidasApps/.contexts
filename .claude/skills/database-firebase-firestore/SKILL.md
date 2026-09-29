---
name: database-firebase-firestore
description: "Use ao trabalhar com Firestore — coleções, queries, índices, regras de segurança. Keywords: firestore, firebase db."
---
# Cloud Firestore

Document DB serverless do Firebase/GCP: coleções → documentos → subcoleções. Real-time listeners, offline cache, security rules na borda.

## Essência
- **Modelo:** `collection/document/subcollection/...` — documentos têm até 1 MB; subcoleção não vem junto na leitura do doc pai.
- **Tipos:** string, number, boolean, map, array, timestamp, geopoint, reference, bytes, null.
- **Queries:** `.where(field, op, val)`, `.orderBy`, `.limit`, `.startAfter`. Compostos requerem **índice composto** (criado via UI/CLI/`firestore.indexes.json`).
- **Limitations:** `or`/`in` com teto de disjunções, sem `like`/`contains`. Range/inequality em **vários campos** é suportado (desde 2024), mas exige índice composto e ordering: igualdades primeiro, depois os campos de inequality (o mais seletivo antes); `orderBy` implícito nesses campos.
- **Real-time:** `onSnapshot` listener — entrega initial + diffs.
- **Transactions:** `db.runTransaction(tx => ...)` — leituras + writes atomicamente. Sem teto de operações por batch/transação: limite é 10 MiB por request e 500 field transformations por documento.
- **Security Rules:** `firestore.rules` — validação no servidor por path, leitura/escrita por user/role. Rules é a primeira (e às vezes única) linha de auth.
- **Custos:** por **leitura/escrita/delete** + storage + bandwidth. Listener real-time = 1 read inicial + 1 read por mudança.
- **Modelagem:** denormalize para minimizar reads; `arrayUnion`/`arrayRemove` para coleções pequenas.
- **Composite indexes** declarados em `firestore.indexes.json`, deploy via CLI.
- **Server timestamps:** `serverTimestamp()` para `createdAt`/`updatedAt`.
- **Pagination:** cursor com `startAfter(lastDoc)`.
- **IDs de documento:** ID automático (`collection.doc()` / `add()` no Admin SDK, `doc(collection(...))` no client). Nunca ULID, UUIDv7 ou timestamp no ID (monotônico → hotspot de escrita). ADR 0005.

## Procedimento mínimo
1. Modelar: documentos pequenos, denormalize relações comuns, subcoleção quando 1-to-many "filha".
2. `firestore.rules` cobrindo cada path: `request.auth != null` + tenant (`resource.data.tenantId == request.auth.token.tenantId`) + ownership/role.
3. Índices compostos no `firestore.indexes.json`; deploy com `firebase deploy --only firestore:indexes`.
4. Para mutação consistente, `runTransaction`. Para escrita em lote, `writeBatch` (≤ 10 MiB); backfill grande com `BulkWriter` (Admin SDK).
5. Real-time: `onSnapshot` em UI; cleanup unsubscribe no unmount.
6. Server timestamps em vez de `Date.now()` para criação/atualização.

## Anti-patterns
- Read em loop (`for id of ids: getDoc(id)`) → use `where(documentId, "in", ids)` (até 30) ou redesenhar.
- Listener sem unsubscribe → vazamento de reads.
- Rule `allow read, write: if true` em prod → DB aberto.
- Documento crescendo sem limite (array de mil itens) → mover para subcoleção.
- Range em vários campos sem índice composto ou com o campo menos seletivo primeiro → query falha ou escaneia demais; declare o índice e ordene por seletividade.

## Mini-exemplo
```ts
// firestore.rules
// top-level multi-tenant: tenantId no doc = claim do token (contracts/firebase-firestore §7)
match /orders/{orderId} {
  allow read: if request.auth != null
    && resource.data.tenantId == request.auth.token.tenantId
    && resource.data.userId == request.auth.uid;
  allow create: if request.auth != null
    && request.resource.data.tenantId == request.auth.token.tenantId
    && request.resource.data.userId == request.auth.uid;
}

// client (tenantId vem do claim do token, não de input livre)
const q = query(
  collection(db, "orders"),
  where("tenantId", "==", tenantId),
  where("userId", "==", uid),
  where("status", "==", "pending"),
  orderBy("createdAt", "desc"),
  limit(20),
);
const unsub = onSnapshot(q, (snap) => setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/stacks/database/firebase-firestore.md`
**Documentação upstream:** documentação oficial da biblioteca na versão pinada em MEMORY.
