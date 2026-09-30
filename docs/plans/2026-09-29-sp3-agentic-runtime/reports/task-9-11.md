# SP3 Tasks 9–11 report (plus review fixes of Tasks 0–6)

Plan: `docs/plans/2026-09-29-sp3-agentic-runtime.md`. Branch `feat/agentic-app-core-sp0`.
Dates 2026-09-29/30. Tasks 7–8 are deferred until SP1's `verifyBearer` lands.

## Commits

| Item | Commit | Message |
|---|---|---|
| Fix 1 | `7cf02dc` | `fix(services): let a non-superuser migrator own the semantic schema` |
| Fix 2 (+ MCP prefix of fix 3) | `0b68d04` | `fix(agents): bind api keys to their tenant and scopes in mastra auth` |
| Fix 3 database URL | `5b8ec4c` | `fix(services): keep socket dsn params and reject bad percent-escapes` |
| Fix 3 fake mode | `944bc17` | `fix(agents): refuse fake models outside local and dev in the factory` |
| Fix 3 db:init | `d800846` | `fix(mastra): load only the services env in db:init` |
| Fix 3 LlmCall example | `04372b0` | `fix(contracts): price the usage.LlmCall example with the price table` |
| Fix 3 embedding model | `723bf13` | `feat(agents): default embeddings to gemini-embedding-2 at 1536 dims` |
| Fix 3 follow-ups | `0004b3a` | `docs(agents): add follow-ups for the mastra bump and openai exclusion` |
| Task 9 | `7783da1` | `feat(agents): add core tool wrapper with authorize, approval and audit` |
| Task 10 | `d69cc79` | `feat(agents): add data catalog tools` |
| Task 11 | `0b1f606` | `feat(catalog): add read-only semantic sql runner with ast guard` |

Only my paths were staged. SP2's uncommitted hunks in `pnpm-workspace.yaml` and `pnpm-lock.yaml`
stay unstaged. For Task 11, the lockfile and workspace file were rebuilt from `HEAD` plus the
`libpg-query` line in a scratch `git worktree` (`pnpm install --lockfile-only`) and staged
with `git update-index`. The only extra lockfile change is pnpm dropping a stale
`(tsx@4.23.15)` vite peer variant; the full install in the main tree makes the same change.

## Review fixes

1. **`0000_baseline.sql`.** Inside the DO block, when
   `NOT pg_has_role(current_user, 'semantic_owner', 'SET')`, the migration now runs
   `GRANT semantic_owner TO <current_user> WITH INHERIT FALSE, SET TRUE`. Superusers skip it.
   The schema REVOKE/GRANT and `ALTER DEFAULT PRIVILEGES` also needed the owner's rights, so they
   now run between `SET ROLE semantic_owner` and `RESET ROLE`.
   - Checked on a throwaway `pgvector:0.8.6-pg18` container with a `CREATEROLE` non-superuser
     (Cloud SQL-like). Before the fix it failed with `must be able to SET ROLE "semantic_owner"`.
     After the fix it passed twice.
   - Locally: `pnpm db:migrate` ran twice, and the file was run directly twice as superuser.
     The container was stopped afterwards.
2. **`FirebaseMastraAuth`.**
   - A `service` principal whose `tenantId` differs from `X-Tenant-Id` names no node:
     `resolveAccessContext` is not called, and the principal has no membership, so the request
     gets 403.
   - A service principal's permissions are now `context.permissions ∩ getEffectivePermissions()`.
     SP1 applies key scopes in `getEffectivePermissions`, so a lax access context can never give
     a key its owner's grants.
   - The fake access port gained `apiKeyScopes`. There are 5 new unit tests.
3. **Minor fixes.**
   - **Database URL.**
     - A malformed percent-escape in the socket DSN now makes the DSN unsupported, so the env
       reports an issue naming `DATABASE_URL` (`InvalidEnvError`) instead of throwing a
       `URIError`.
     - Socket query parameters are kept in `params` and mapped the way postgres.js maps a URL:
       `sslmode` becomes `ssl` (`disable` turns it off), the integer pool keys become options,
       and the rest become server parameters. Explicit pool options win.
   - **Fake mode.** `createModelProvider` throws `FakeModeNotAllowedError` for `AI_MODE=fake`
     outside local/dev. `ModelFactoryEnv` now needs `APP_ENV`.
   - **MCP path.** `requiredPermissionFor(path, apiPrefix)` and the
     `FirebaseMastraAuth({ apiPrefix })` option use `<apiPrefix>/mcp/`; the default prefix is
     `/api`.
   - **`db:init`.** It loads only the services env through `loadStorageInitEnv`. It ran with
     `AI_MODE=real` and no Google key: "mastra storage ready".
   - **`usage.LlmCall` example.** The cost is now 4950 µUSD (1200 × 1.5 + 350 × 9). A test ties
     every example to `estimateCostMicroUsd`. The catalog was regenerated (5 files, only this
     value changed).
   - **Embedding model.** The Gemini API deprecations page (updated 2026-09-30 UTC) lists
     `gemini-embedding-001` as deprecated: shutdown 2028-05-14, replacement
     `gemini-embedding-2` (released 2026-04-22). `gemini-embedding-2` supports
     `output_dimensionality` 128–3072, with 1536 recommended, and Vertex lists it. The default
     is now `google/gemini-embedding-2` at 1536 dimensions. It is priced at $0.20 per 1M input
     tokens (pricing page updated 2026-09-24). This is recorded as an amendment in decision
     0022, including that the embedding spaces are incompatible.
   - **Follow-ups.** Rows #17 (bump the Mastra 1.72 train) and #18 (remove the `@ai-sdk/openai`
     release-age exclusion after 2026-10-06) were added.

## Task 9: `defineCoreTool` and tool registry

- **`src/context/agent-request-context.ts`.** This lands ahead of Task 7 because tools need it.
  - It defines `AGENT_CONTEXT_KEYS` (one request-context key per `AgentRequestContext` field)
    and `AGENT_PRINCIPAL_KEY = "corePrincipal"` (the verified SP1 principal).
  - `readAgentContext` validates with `AgentRequestContextSchema` and `PrincipalSchema`. It
    rejects a principal that is not the context's caller (uid, key owner or key tenant), and it
    never uses a default tenant.
  - `nodeOfContext` returns the `NodeRef` of the context.
  - Task 7's middleware must write these keys.
- **`tools/define-core-tool.ts`.** `defineCoreTool` validates at boot:
  - the id pattern;
  - a description of at least 10 chars;
  - the permission pattern;
  - a `z.strictObject` input with every field `.describe()`d;
  - `preview` only on mutations.

  It also exports `hashToolInput` (SHA-256 of canonical JSON) and `PendingApprovalResultSchema`.
- **`tools/core-tool-pipeline.ts` (`runCoreTool`).** Each call runs these steps in order:
  1. Strict input check (`TOOL_INPUT_INVALID`).
  2. Context check (`CONTEXT_MISSING`, with the missing keys).
  3. SP1 `authorize()` with ceiling = context permissions ∩ the agent's ceiling
     (`agentCeilings[agentId]`). A deny gives `FORBIDDEN`; a port error gives
     `AUTHORIZATION_UNAVAILABLE`.
  4. For a mutation where `requiresApproval` is set: build an `agents.ApprovalRequest`
     (`agent-command`, idempotency key `runId:toolCallId`, `summarize`/`preview`) and call
     `ApprovalPort.requestApproval`. The result is `{ status: 'pending-approval', approvalId }`,
     and nothing executes. Any error gives `APPROVAL_UNAVAILABLE`.
  5. Execute with `AbortSignal.any([timeout, run])`: 15 s for reads, 30 s for mutations, or a
     per-tool value. Timeout gives `TOOL_TIMEOUT`; a run abort gives `TOOL_ABORTED`.
  6. Output check (`TOOL_OUTPUT_INVALID`). Unknown execute errors become `TOOL_FAILED` (the
     message is not passed on); a `CoreToolError` thrown by execute keeps its code.
  7. Audit. Mutations and opted-in reads are recorded (`AGENT_TOOL_EXECUTED` or the tool's
     action) with `toolId`, `permission`, `agentId`, `inputHash` and `outcome`
     (`succeeded|failed|denied|pending-approval`, plus `errorCode`, `reason` or `approvalId`,
     and optional metadata such as a fingerprint). The raw input is never recorded. An audit
     failure gives `AUDIT_UNAVAILABLE` with the outcome.
- **`tools/tool-registry.ts`.** `createToolRegistry(deps)` supports `register`, `has`, `get`,
  `ids` and `toMastraTools(ids)`. A duplicate id gives `DuplicateToolError`; an unknown id
  gives `TOOL_NOT_FOUND`. `bindCoreTool` wraps `createTool`:
  - `strict: true`;
  - `requireApproval: true` for every mutation;
  - a mutation's output schema also accepts the pending result;
  - `toolCallId` and `agentId` come from `ctx.agent`, and `runId` from `ctx.workflow`.
- **`tools/tool-errors.ts`.** `CoreToolError` (`code`, `toolId`, `details`, safe message) and
  `toolFailure`.
- **Spans.** Mastra already opens a `TOOL_CALL` span per tool. No extra `gen_ai.tool.name`
  span is created here; Task 17 (observability) can add attributes.

## Task 10: catalog tools

- **`ai-catalog-source.ts`.** It imports `../../../../../docs/catalog/catalog.ai.json` with
  `{ type: "json" }`. `app/docs` is not a package, so no alias can reach it; the comment says
  why. Node 26 loads the JSON natively, so `package.json` did not need a change.
- **`ai-catalog-reader.ts`.** It validates the catalog with Zod (`InvalidAiCatalogError`) and
  sorts entries by id.
  - `list({ permissions, query?, kind?, limit })` returns `{ entities, total, truncated }`.
  - `describe({ id, permissions })` returns the fields (without `sensitive`, a second check),
    UI hints, relations, and examples with every non-`none` value set to `[redacted]`.
  - A contract without a `permission` is visible to members; there are 30 in the current
    catalog, all shared core shapes.
- **Tools** (all `read`, permission `core.catalog.read`; visibility uses the effective context
  permissions):
  - `catalog.listEntities`: `limit` from 1 to 50, default 20.
  - `catalog.describeEntity`: a hidden contract gives the same `ENTITY_NOT_FOUND` as an
    unknown one.
  - `catalog.renderForm`: needs `FormCommandCatalog.get(commandId)`, which Task 19 fills from
    modules. Errors are `COMMAND_NOT_FOUND`, `COMMAND_CONTRACT_MISMATCH`, `ENTITY_NOT_FOUND`
    (target contract hidden) and `FORBIDDEN` (SP1 `authorize` on the command permission).
    `initialValues` keeps only the command's fields whose values pass their schema. The output
    is `{ ui: ToolUi }` with `schema-form`, and the tool writes nothing.

## Task 11: `catalog` context and `querySemanticSql`

- **Dependency.** `libpg-query` 18.1.5 (MIT, latest, WASM, no install scripts), pinned in
  `catalog:` and used by `@core/services`.
- **Services files** (`packages/services/src/services/catalog/`):
  - `domain/semantic-view.ts`: `createSemanticViewRegistry` maps view → contract → permission;
    `allowedFor(permissions)` returns the view names.
  - `adapters/driven/sql-guard.ts`: parses with PG 18 and walks every PascalCase node type
    against an allowlist.
    - Checks per node: `SelectStmt` has no INTO and no locking clause. `RangeVar` must be
      `semantic.<allowed view>` or a CTE name, with no catalog name. `FuncCall` must be on the
      function allowlist, qualified by nothing or by `pg_catalog`. `TypeCast`, `A_Expr` and
      `SQLValueFunction` each have an allowlist (`current_date` and `current_timestamp` are
      allowed; `current_user` is not). `ParamRef` must be within the bound parameters.
    - The input is capped at 10 000 chars. The guard returns the statement text (trailing `;`
      stripped) and its `fingerprint`.
    - `wrapWithLimit` puts newlines around the inner SQL, so a trailing `--` comment cannot
      comment out the cap.
  - `application/use-cases/run-semantic-query.ts`:
    `makeRunSemanticQuery({ views, guard, runner })({ principal: { tenantId, nodeIds, permissions }, sql, params?, limit? })`.
    - LIMIT is 100 by default and 1000 at most; `limit` < 1 gives `INVALID_LIMIT`.
    - At most 20 parameters. An empty tenant gives `TENANT_CONTEXT_MISSING`.
    - A rejected statement never reaches the runner.
  - `adapters/driven/postgres-semantic-runner.ts`: runs `withTenantTransaction(readOnly)`, then
    `SET LOCAL statement_timeout`, then `SET LOCAL ROLE semantic_reader`, then the wrapped
    statement with `LIMIT n+1` (to detect truncation) and bound parameters. SQLSTATE 57014
    gives `QUERY_TIMEOUT`; anything else gives `QUERY_FAILED` (no database message).
  - `adapters/driven/bigquery-semantic-runner.ts`: always `CONNECTOR_DISABLED`.
- **Migration `0002_semantic_reader_grants.sql`** (made with `drizzle-kit generate --custom`,
  journal and snapshot included; applied locally and run again directly, idempotent):
  - `GRANT semantic_reader TO mastra_runtime WITH INHERIT FALSE, SET TRUE` (guarded);
  - as `semantic_owner`: revoke everything on semantic tables from PUBLIC, `mastra_runtime` and
    `semantic_reader`; then `GRANT SELECT` to `semantic_reader`; `semantic_reader` gets no
    CREATE.
- **Agents.** `tools/sql/query-semantic-sql.tool.ts` (`sql.querySemanticSql`, permission
  `core.catalog.query`, read).
  - Tenant, node ids (`projectId`, `unitId`) and permissions come from the context; the model
    supplies only `sql`, `params` and `limit`.
  - It audits `SEMANTIC_QUERY_EXECUTED` with `fingerprint` and `rowCount`.
  - Errors map to typed codes (`SQL_REJECTED` with `reason`/`detail`, `QUERY_TIMEOUT`,
    `CONNECTOR_DISABLED`, and others).
  - The new `SemanticQueryPort` (`catalog`) is in `AgentRuntimePorts` and in the fakes.
- **Personal cells.** A view needs its contract's read permission before the query can use it
  at all, so personal cells only ever reach holders of that permission.
- **Sample view.** None ships (`semantic.example_notes` waits for the example module to store
  notes in Postgres). The Postgres test builds its own fixture: a FORCE RLS base table and
  views owned by `semantic_owner`, dropped afterwards.

## Verification (fresh runs after the last commit)

```
pnpm -F @core/agents test -- tools    → Test Files 14 passed, Tests 135 passed (filter not applied: whole unit project)
pnpm -F @core/agents test -- catalog  → Test Files 14 passed, Tests 135 passed
pnpm -F @core/agents test -- sql      → Test Files 14 passed, Tests 135 passed
pnpm -F @core/services test -- sql-guard → Test Files 38 passed, Tests 307 passed (sql-guard.test.ts: 49 cases)
pnpm test:postgres                    → @core/services Test Files 3 passed, Tests 16 passed; Tasks 2 successful
firebase emulators:exec --only auth,firestore "pnpm -F @core/agents test:emulators" → Tests 6 passed, exited code 0
pnpm -F @core/agents typecheck / lint → clean; pnpm -F @core/services typecheck / lint → clean
pnpm -F @core/mastra typecheck / test → clean / Tests 24 passed
pnpm db:migrate (x2)                  → done (3 journal rows)
AI_MODE=real (no key) pnpm -F @core/mastra db:init → "mastra storage ready (APP_ENV=local)"
git diff --quiet main -- .contexts .claude && echo framework-ok → framework-ok
```

## Concerns

1. **SP1's `AUDIT_ACTIONS` lacks `AGENT_TOOL_EXECUTED` and `SEMANTIC_QUERY_EXECUTED`.** SP1's
   audit log entry validates `action` against that enum, so SP3 audits will be refused once
   the audit port is bound to SP1's writer. SP1 owns `contracts/audit/audit-action.schema.ts`
   and is active, so I did not edit it. It should add both names; spec §3.2 says "SP3 adds
   action names only".
2. **`runId`.** Mastra 1.71 gives agent tools no run id (only `ctx.agent.toolCallId`), so
   agent runs use the context `requestId` as `runId`, and the idempotency key is
   `requestId:toolCallId`. The Task 8 gateway should pass `runId = requestId` to Mastra so the
   two match. Workflow calls use `ctx.workflow.runId`.
3. **Task 7 must write the context keys** that `readAgentContext` reads (`AGENT_CONTEXT_KEYS`
   plus `corePrincipal`) and fill `agentCeilings` in the registry deps. Until then, tools only
   run in tests.
4. **The catalog JSON is imported by relative path** (`docs/` is not a package), and it is not
   yet built through `mastra build`. Task 7 composition should confirm the bundler inlines it.
5. **Contracts without a `permission`** (30, all core shapes) are visible to every member in
   `listEntities`. Tell me if they should be fail-closed instead.
6. **`gemini-embedding-2` was not exercised against the real API** (no key here). The real-mode
   evals/RAG task should check that it accepts `outputDimensionality: 1536` through
   `@ai-sdk/google` 4.0.85 and Vertex.
7. The remote privilege path of `0000`/`0002` was checked on a local non-superuser only, not
   on Cloud SQL itself.
