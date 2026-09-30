# 0022. Knowledge base tables, text tenant ids and embedding dimension

- **Status:** accepted
- **Date:** 2026-09-29
- **Scope:** Postgres schema `ai`, `app/packages/services/src/services/knowledge`, `app/packages/agents` (local decision; the framework is unchanged)
- **Records:** SP3 spec D3-06, D3-07, D3-08 (§5.2, §11)
- **Deviates from:** `.contexts/engineering/contracts/pgvector.md` (`tenant_id uuid`)

## Context

The knowledge base needs tenant isolation that holds even if application code forgets a filter, versioned embeddings (`contracts/pgvector.md` §4) and one embedding dimension per table. Tenants are Firestore automatic ids (framework ADR 0005), not uuids. Mastra's `createVectorQueryTool` reads its filter from the request context, and its PgVector tables do not follow `contracts/pgvector.md`.

## Decision

1. **D3-06 — Dimension.** One dimension for v1: **1536** (`vector(1536)`, HNSW cosine), produced by `gemini-embedding-001` with `outputDimensionality: 1536`. Memory recall uses the same embedder. A new model or dimension means `ai.chunks_v2`.
2. **D3-07 — App-owned tables.** `ai.documents` and `ai.chunks_v1` (columns and indexes of spec §11) are owned by the app, created by Drizzle migrations, with `FORCE ROW LEVEL SECURITY` and the policy `tenant_id = current_setting('app.tenant_id', true) OR tenant_id = '_platform'`. Mastra `PgVector` (schema `mastra`) is used only for memory semantic recall.
3. **D3-08 — `tenant_id text`.** Every app Postgres row carries `tenant_id text` (the Firestore tenant id), not `uuid`. `_platform` is a reserved tenant id for platform content (catalog, module docs), readable by every tenant.

## Consequences

- A missing `app.tenant_id` setting returns only `_platform` rows, never another tenant's rows.
- Queries set the tenant through `withTenantTransaction` (`set_config(..., true)`), never by string interpolation.
- The deviation from `contracts/pgvector.md` is limited to the type of `tenant_id`; naming, versioning and HNSW rules still apply. `contracts/postgres.md` ("Tenant isolation") already uses `tenant_id TEXT`.

## Alternatives rejected

- **`tenant_id uuid` with a Firestore-id to uuid mapping table.** Adds a lookup to every call and a second identity for the same tenant.
- **`createVectorQueryTool` / Mastra PgVector for the KB.** The tenant filter would come from request context that a caller can shape, and the tables would not follow the contract.
- **Native 3072 dimensions.** pgvector's HNSW indexes `vector` up to 2000 dimensions; 1536 keeps the index and memory cost bounded.
