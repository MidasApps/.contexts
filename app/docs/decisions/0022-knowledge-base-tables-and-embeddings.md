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

## Amendments

- **2026-09-29 — default embedding model `gemini-embedding-2`.** The Gemini API deprecations
  page (checked 2026-09-29, updated 2026-09-30 UTC) lists `gemini-embedding-001` as deprecated
  with shutdown on 2028-05-14 and `gemini-embedding-2` (released 2026-04-22, no shutdown date)
  as its replacement; the embeddings page gives `output_dimensionality` 128–3072 for
  `gemini-embedding-2`, with 1536 recommended, and Vertex AI lists Gemini Embedding 2. No vector
  was stored yet, so the default `AI_MODEL_EMBEDDING` becomes `google/gemini-embedding-2` with
  `outputDimensionality: 1536` (D3-06 keeps its dimension; `ai.chunks_v1` is unchanged). The two
  models' embedding spaces are incompatible: an environment that overrides back to
  `gemini-embedding-001` must never share `ai.chunks_v1` or memory vectors with one using
  `gemini-embedding-2`; changing the model once data exists means `ai.chunks_v2`. Price: $0.20
  per 1M text input tokens (pricing page, updated 2026-09-24), now in `model-prices.ts`.
- **2026-09-30 — write policies and runtime role (SP3 Task 12).** The D3-07 policy is split so
  a tenant can read `_platform` rows but never write them: `*_tenant_rows` (`FOR ALL`, `USING`
  and `WITH CHECK tenant_id = current_setting('app.tenant_id', true)`) and `*_platform_read`
  (`FOR SELECT`, `tenant_id = '_platform'`). Platform content is written only with
  `app.tenant_id = '_platform'` (catalog and module ingestion). Tenant documents use the
  `tenant` and `project:*` namespaces; `_platform` documents use `catalog` and `module:*`
  (checked by the use cases). `ai.chunks_v1` references `ai.documents(id, tenant_id)`, so a
  chunk can never point at another tenant's document. Every repository transaction runs as
  `SET LOCAL ROLE knowledge_runtime` (NOLOGIN, NOBYPASSRLS, DML on the two tables only;
  migration `0004`), so the policies hold even when the login role could bypass them;
  `mastra_runtime` may switch to it (SET, no inherited rights). Search compares only vectors
  of the configured `AI_MODEL_EMBEDDING` (`embedding_model` filter) and drops citations below
  similarity 0.3.
- **2026-09-30 — ingestion, catalog reindex and `/v1/knowledge` (SP3 Task 14).**
  - *Workflows* (`@core/agents`, served by Mastra). `knowledge-ingest`: `resolve-source` →
    `extract-text` → `chunk` → `store` → `embed` → `emit`, `retryConfig { attempts: 3, delay:
    2000 }`, progress as transient `data-ingest-progress` parts. Every step re-reads the tenant
    from the typed request context; `resolve-source` authorizes `core.knowledge.write` with
    SP1 `authorize()`. Expected failures (`CONTEXT_MISSING`, `FORBIDDEN`, `FILE_*`,
    `UNSUPPORTED_MEDIA`, `EMPTY_CONTENT`) end the run with `status: "failed"` and a code
    instead of retrying. `store` (upsert by `(tenant_id, source, source_ref)`) runs before
    `embed`, and `embed` embeds in batches of 64 and replaces the chunks in one transaction, so
    vectors never enter the workflow snapshot; unchanged content (`content_hash`) skips both.
    Namespace: `project:<projectId>` when the context has a project, else `tenant`.
  - *Chunking* is own code (`chunk-document.ts`: recursive Markdown/text splitter, 2000
    characters, overlap 200), not `@mastra/rag` `MDocument`: `@mastra/rag` 2.6.5 pulls the AWS
    Bedrock runtime SDK and an alpha reranker client for a pure string function.
  - *Extraction.* Text, Markdown, CSV and JSON as UTF-8, HTML reduced to text; PDF only through
    the optional `parsePdf` hook (Firecrawl `parse`, Task 23), else `UNSUPPORTED_MEDIA`. URL
    sources go through `WebContentPort` (Firecrawl, Task 23; fixtures in tests); until then
    the Mastra binding rejects and URL runs fail after their retries.
  - *Embedding model id.* Chunks store `embedding_model = AI_MODEL_EMBEDDING` in real mode and
    `fake/fake-embedding` in fake mode (`embeddingModelIdOf`), and search filters on the same
    id, so switching `AI_MODE` never mixes embedding spaces. `embedding_version =
    v1-chunk2000-d1536`.
  - *Catalog.* `catalog-reindex` writes one `_platform`/`catalog` document per AI-catalog
    contract (title = contract id, no examples, no `sensitive` fields, metadata `permission`).
    It refuses runs that carry a caller principal (`PLATFORM_ONLY`), so only in-process
    callers (seed, deploy, the SP5 scheduler) write platform rows. `pnpm seed:local` runs it and
    indexes two sample documents for `DemoOrgSeed000000001` (SP1's organization seed should
    pass its id).
  - *Routes.* `GET /v1/organizations/{organizationId}/knowledge/documents` (cursor pages),
    `GET|DELETE .../knowledge/documents/{documentId}` and `POST .../knowledge/sources`
    (`core.knowledge.read|delete|write`; 202 `{ data: { runId } }` through the new gateway
    `launchWorkflow`, which starts the run without waiting). The organization is in the path
    because row level security needs the tenant before the lookup. A file source must be a
    ready `knowledge` upload of the organization (404 / 409 `CONFLICT` / 400). No new error
    code.
  - *Roles.* Migration `0005` adds `web_runtime` (NOLOGIN) with SET on `knowledge_runtime`;
    deploy grants it to the web service's database user.
  - *Events and audit.* `KNOWLEDGE_DOCUMENT_INDEXED` is a structured log line with a ULID
    `eventId` until the event bus exists. Ingestion and deletes are not audited yet: SP1's
    `AUDIT_ACTIONS` has no knowledge action.
- **2026-09-30 — search tool, citation guard and knowledge agent (SP3 Task 15).**
  - `knowledge.searchKnowledge` (read, `core.knowledge.read`): the model sends only `query`,
    optional `namespaces` and `topK` ≤ 8. Tenant comes from the context; namespaces are the
    model's request ∩ the allowed set (`tenant`, the active `project:*`, and `catalog` for
    `core.catalog.read` holders), falling back to the whole allowed set. Catalog hits are kept
    only when the caller may see the contract (the AI catalog reader, decision 0024; catalog
    documents are titled with the contract id). Module namespaces join with SP5 agent settings.
  - `citation-guard` (output processor, `processOutputResult`): the retrieved set is every
    `kb:` id in this turn's tool results; `[kb:...]` markers outside it are removed, and each
    assistant message gets `content.metadata.confidence` = `grounded` or `low` (no valid
    citation).
  - Agent `knowledge` (chat role, `maxSteps` 6, ceiling `core.chat.use`, `core.knowledge.read`,
    `core.catalog.read`), instructions `instructions/knowledge.v1.md` read by
    `loadInstructions`. `apps/mastra` copies the folder into `src/mastra/public/instructions`
    (gitignored) before `mastra build` and `mastra dev`, because the bundle reads it next to
    itself. The fake model's tool follow-up now cites the `kb:` ids it saw, so fake runs are
    grounded. Skill `skills/knowledge-citations/SKILL.md` is validated with
    `validateSkillContent`; attaching skills to agents is Task 20 (D3-21).
