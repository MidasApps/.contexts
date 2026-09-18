---
name: contracts-firebase-firestore
description: Use ao definir contratos/modelagem para Firestore. Keywords: firestore contract, firestore schema.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Contracts: Firestore Modeling

Convenções de modelagem para Firestore: paths de coleções, naming, timestamps, denormalização, security rules como contrato.

## Essência
- **Path convention:** `/<resource-plural>/{id}/<sub-resource-plural>/{id}` — ex.: `/tenants/{tid}/orders/{oid}`.
- **Naming:** `camelCase` em campos (idiomático JS); `kebab-case` ou `camelCase` em IDs gerados.
- **IDs:** auto-id do Firestore por default; custom ID quando externo conhecido (slug, idempotency key).
- **Multi-tenant:** prefixar paths por tenant (`/tenants/{tid}/...`) — simplifica security rules e isolamento.
- **Timestamps:** `createdAt`, `updatedAt` como `serverTimestamp()` — nunca `Date.now()` (clock skew).
- **Denormalização proposital:** Firestore cobra por read; replicar pequenos campos (`authorName` no doc do post) evita reads extras. Atualizar em fan-out.
- **Limites:** doc até 1MB; sem subcoleção implícita no read do pai; array de até ~20k itens prático; até ~500 ops por batch/transaction.
- **Subcoleção vs array vs root collection:**
  - **Subcoleção** quando 1:N filhos grandes e queryáveis independentemente.
  - **Array de map** quando ≤ poucas dezenas e sempre lido junto.
  - **Root collection** com FK quando N:N ou independente.
- **Security rules** SÃO o contrato server-side. Validar shape, ownership e permissões.
- **Composite indexes** declarados em `firestore.indexes.json` e versionados.
- **Audit fields:** `createdBy`, `updatedBy` (uid) quando rastreabilidade exigida.
- **Soft-delete:** `deletedAt` + filtro nas queries; sem `WHERE not-equals` para null, usar `archived: false`.
- **Schema validation:** rules + Zod no client/server (Firestore não impõe schema).

## Procedimento mínimo
1. Desenhar path hierárquico por tenant; coleções no plural.
2. Cada doc: `createdAt`, `updatedAt` (serverTimestamp), ownership/tenant fields.
3. Security rules cobrindo create/read/update/delete por path com ownership check.
4. Composite index declarado para cada query com 2+ filtros/orderBy.
5. Denormalizar campo "frequente" para evitar joins client-side; fan-out update em writes.
6. Validação de shape: rules + Zod nos handlers (Cloud Functions onCall ou client).

## Anti-patterns
- Documento com array que cresce indefinidamente → mover para subcoleção.
- Security rules `allow read, write: if true` → DB aberto.
- `new Date()` em vez de `serverTimestamp()` → clock skew, ordering errado.
- N reads sequenciais por ID em vez de `where(documentId, "in", ids)` → custo + latência.
- Sem `firestore.indexes.json` versionado → drift entre devs.

## Mini-exemplo
```ts
// path: /tenants/{tid}/orders/{oid}
const OrderDoc = z.object({
  tenantId: z.string(),
  customerId: z.string(),
  customerName: z.string(),              // denormalizado
  status: z.enum(["pending", "paid", "cancelled"]),
  totalCents: z.number().int().nonnegative(),
  createdAt: z.any(),                    // serverTimestamp
  updatedAt: z.any(),
  createdBy: z.string(),                 // uid
});
```
```js
// firestore.rules
match /tenants/{tid}/orders/{oid} {
  allow read: if isMemberOf(tid);
  allow create: if isMemberOf(tid)
    && request.resource.data.tenantId == tid
    && request.resource.data.createdBy == request.auth.uid;
  allow update: if isMemberOf(tid)
    && request.resource.data.tenantId == resource.data.tenantId;
}
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/contracts/firebase-firestore.md`
**Documentação upstream:** MCP `liquid-docs` — busque por `firebase-firestore` para detalhes da versão atual.
