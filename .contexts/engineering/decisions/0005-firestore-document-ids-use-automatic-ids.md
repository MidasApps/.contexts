# 0005. IDs de documento do Firestore usam o ID automático

- **Status:** accepted
- **Date:** 2026-09-28
- **Deciders:** projeto DDC / sincronização `.claude` × `.contexts`
- **Tags:** `engineering`, `contracts`, `firestore`, `ids`
- **Supersedes:** a linha "Firestore document IDs: ULID textual" da [0001](0001-ddc-engineering-baseline-and-harness-enforcement.md) e o trecho "Firestore e `eventId` ULID" da [0002](0002-baseline-2026-09-version-and-naming-alignment.md). `eventId` continua ULID.

## Context

A 0001 manteve ULID como ID de documento do Firestore. `contracts/firebase-firestore.md` justificava a escolha dizendo que o ULID evita hotspot. Isso está errado: os 48 bits iniciais do ULID são o timestamp, então IDs criados em sequência são monotônicos e caem na mesma faixa do índice.

A doc oficial (firebase.google.com/docs/firestore/best-practices, conferida em 2026-09-28) diz: "Do not use monotonically increasing document IDs", porque "sequential IDs can lead to hotspots that impact latency". E também: "You should not encounter hotspotting on writes if you create new documents using automatic document IDs" (algoritmo de dispersão).

## Decision

1. **ID de documento novo no Firestore = ID automático** (`collection.doc()` / `add()` no Admin SDK, `doc(collection(...))` no client SDK). String opaca de 20 caracteres, sem prefixo.
2. **ID natural** continua permitido quando a chave externa é estável e única (`users/{uid}` do Firebase Auth, idempotency key de um webhook).
3. **Ordem por tempo** vem do campo `createdAt` (Timestamp) e do índice, nunca do ID.
   - Um campo indexado com valor sequencial também tem limite de escrita ("the maximum write rate to the collection is 500 writes per second", mesma página de best practices). Coleção com escrita alta isenta `createdAt` do índice single-field quando não ordena por ele.
4. **ULID continua** onde não é ID de documento do Firestore: `eventId` (dedup), `Idempotency-Key`, `X-Request-Id`.
5. Validação: ID do Firestore é `z.string().min(1).brand<"XId">()`; ULID é `z.ulid()` (Zod 4). `z.uuid()` só para uuidv7 do Postgres.
6. Dados já gravados com ULID não migram: o ID é opaco para o consumidor. A regra vale para documentos novos e coleções novas.

## Consequences

- `contracts/firebase-firestore.md` §2, `rules/data-modeling.md`, `rules/api-design.md`, `contracts/api.md`, `contracts/events.md` (`aggregateId`), `contracts/bigquery.md` e as rules e skills em `.claude/` passam a dizer "Postgres `uuidv7()`, Firestore ID automático, `eventId` ULID".
- `aggregateId` de um evento de entidade do Firestore é o ID automático do documento, não um ULID.
- Continua valendo "não misturar dois formatos de PK no mesmo bounded context sem ADR".

## References

- https://firebase.google.com/docs/firestore/best-practices
- [0001](0001-ddc-engineering-baseline-and-harness-enforcement.md), [0002](0002-baseline-2026-09-version-and-naming-alignment.md)
