---
name: database-firebase-firestore
description: Use ao trabalhar com Firestore — coleções, queries, índices, regras de segurança. Keywords: firestore, firebase db.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Cloud Firestore

Document DB serverless do Firebase/GCP: coleções → documentos → subcoleções. Real-time listeners, offline cache, security rules na borda.

## Essência
- **Modelo:** `collection/document/subcollection/...` — documentos têm até 1 MB; subcoleção não vem junto na leitura do doc pai.
- **Tipos:** string, number, boolean, map, array, timestamp, geopoint, reference, bytes, null.
- **Queries:** `.where(field, op, val)`, `.orderBy`, `.limit`, `.startAfter`. Compostos requerem **índice composto** (criado via UI/CLI/`firestore.indexes.json`).
- **Limitations:** `or` limitado, sem `not-in`+orderBy em campos diferentes, sem `like`/`contains`, range em UM campo por query.
- **Real-time:** `onSnapshot` listener — entrega initial + diffs.
- **Transactions:** `db.runTransaction(tx => ...)` — leituras + writes atomicamente; até 500 docs por write batch.
- **Security Rules:** `firestore.rules` — validação no servidor por path, leitura/escrita por user/role. Rules é a primeira (e às vezes única) linha de auth.
- **Custos:** por **leitura/escrita/delete** + storage + bandwidth. Listener real-time = 1 read inicial + 1 read por mudança.
- **Modelagem:** denormalize para minimizar reads; `arrayUnion`/`arrayRemove` para coleções pequenas.
- **Composite indexes** declarados em `firestore.indexes.json`, deploy via CLI.
- **Server timestamps:** `serverTimestamp()` para `created_at`/`updated_at`.
- **Pagination:** cursor com `startAfter(lastDoc)`.

## Procedimento mínimo
1. Modelar: documentos pequenos, denormalize relações comuns, subcoleção quando 1-to-many "filha".
2. `firestore.rules` cobrindo cada path com `request.auth.uid` checks.
3. Índices compostos no `firestore.indexes.json`; deploy com `firebase deploy --only firestore:indexes`.
4. Para mutação consistente, `runTransaction`. Para escrita em lote, `writeBatch` (até 500 ops).
5. Real-time: `onSnapshot` em UI; cleanup unsubscribe no unmount.
6. Server timestamps em vez de `Date.now()` para criação/atualização.

## Anti-patterns
- Read em loop (`for id of ids: getDoc(id)`) → use `where(documentId, "in", ids)` (até 30) ou redesenhar.
- Listener sem unsubscribe → vazamento de reads.
- Rule `allow read, write: if true` em prod → DB aberto.
- Documento crescendo sem limite (array de mil itens) → mover para subcoleção.
- Query com filtro de range em 2 campos diferentes → não permitido; redesign.

## Mini-exemplo
```ts
// firestore.rules
match /tenants/{tid}/orders/{oid} {
  allow read: if request.auth.uid != null && resource.data.userId == request.auth.uid;
  allow create: if request.auth.uid != null && request.resource.data.userId == request.auth.uid;
}

// client
const q = query(
  collection(db, "tenants", tid, "orders"),
  where("status", "==", "open"),
  orderBy("createdAt", "desc"),
  limit(20),
);
const unsub = onSnapshot(q, (snap) => setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/stacks/database/firebase-firestore.md`
**Documentação upstream:** MCP `liquid-docs` — busque por `firebase-firestore` para detalhes da versão atual.
