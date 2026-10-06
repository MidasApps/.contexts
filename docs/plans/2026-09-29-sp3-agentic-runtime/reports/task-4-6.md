# SP3 Tasks 4–6 report

Plan: `docs/plans/2026-09-29-sp3-agentic-runtime.md`. Branch `feat/agentic-app-core-sp0`.
Date 2026-09-29.

## Commits

| Task | Commit | Message |
|---|---|---|
| 4 | `7caa664` | `feat(contracts): add agent, knowledge, connector, usage, file contracts` |
| 5 | `8061ab2` | `feat(agents): add model roles, price table and deterministic fakes` |
| 6 | `2f42755` | `feat(agents): add firebase mastra auth provider` |

Other agents were committing to `packages/contracts` (SP1) and had uncommitted hunks in
`app/pnpm-workspace.yaml`, `app/pnpm-lock.yaml` and `packages/client` (SP2). For Tasks 5 and 6
the workspace file and lockfile were built from `HEAD` plus only SP3's changes in a throwaway
`git worktree` in the scratchpad (`pnpm install --lockfile-only`), and those blobs were staged
with `git update-index`. SP2's hunks stay unstaged in the working tree.

## Task 4: contracts

New folders in `packages/contracts/src/contracts/`, all `z.strictObject`, full field meta,
one example per contract (per type for connectors):

| Contract | Kind | Notes |
|---|---|---|
| `agents.AgentRequestContext` | settings | spec §4.3 keys; `organizationId === tenantId` refine; ULID `requestId`; `activeScreen` ≤ 200 |
| `agents.AgentSettings` | settings | `enabledAgents`, `webTools`, `guardrails.pii`, `budget`, audit timestamps |
| `agents.ToolUi` | ui-component | kebab-case `component`, `props` record (`personal`) |
| `agents.ApprovalRequest` | command | action input of SP1 approval kind `agent-command` (`AGENT_COMMAND_ACTION_KIND`); refine `idempotencyKey === runId:toolCallId` |
| `knowledge.KnowledgeDocument` | entity | uuid id, namespace regex (`tenant`, `catalog`, `project:<id>`, `module:<id>`), `_platform` accepted (`PLATFORM_TENANT_ID`) |
| `knowledge.KnowledgeSource` | command | discriminated `file` / `url` (https only) |
| `knowledge.Citation` | view | `kb:<uuid>#<n>`, score 0–1, relation to the document |
| `connectors.Connector` | entity | discriminated by `type` (`openapi`, `mcp`, `postgres`, `browser`); https only; `allowedHosts` DNS names only (no IP literals, no `localhost`); `secretRef` only, never a secret |
| `connectors.ConnectorToolPolicy` | settings | `readOnly ⊆ allow` |
| `usage.LlmCall` | view | `costMicroUsd` integer or `null` |
| `usage.UsageSummary` | view | month `YYYY-MM`, totals, caps, alert threshold < 100, per model |
| `files.FileUploadRequest` | command | purpose, safe file name, media type, size ≤ 200 MB |
| `files.StoredFile` | entity | refine `storagePath === tenants/{tenantId}/files/{id}` |

Also `FORWARDED_HEADERS` (lowercase names shared by the gateway and the middleware),
`ACTIVE_SCREEN_MAX_LENGTH`, and `AGENT_PERMISSIONS` (the 14 permissions of spec §2.2 in
SP1's `PermissionDefinition` shape).

**Nested registered schema gotcha.** A registered contract schema reused as a field (`.meta()`
clone) inherits the contract's registry entry (`kind`, `examples`), so the field meta check
fails once the catalog registers both. `ConnectorToolPolicy` now uses a schema factory
(`buildConnectorToolPolicySchema`), and `composition.test.ts` checks every registered contract
for field meta problems after registration.

`pnpm contracts:catalog` regenerated `docs/catalog/**` and `docs/openapi/v1.yaml` (SP1 has
since added its own contracts; the catalog stays consistent, see the check below).

## Task 5: models

- Pins (measured with `npm view` at about 21:55 -03): `ai` 7.0.122, `@ai-sdk/provider`
  4.0.19, `@ai-sdk/google` 4.0.85, `@ai-sdk/google-vertex` 5.0.98, `@ai-sdk/openai` 4.0.81,
  `@ai-sdk/anthropic` 4.0.68, all Apache-2.0 and all equal to `latest`. `@ai-sdk/google-vertex`
  is not in the spec's list; it is needed for `GOOGLE_AI_BACKEND=vertex` (`@ai-sdk/google`
  only covers AI Studio). pnpm added `@ai-sdk/openai@4.0.81` (published 2026-09-29 09:48Z) to
  `minimumReleaseAgeExclude`; it is commented there with a removal date of 2026-10-06.
- `provider-registry.ts`: lazy, memoized provider instances with injectable factories.
  Settings come only from the validated env. `ModelProviderConfigError` is thrown when a
  provider is used without its variables.
- `model-factory.ts`: `createModelProvider(env, { providerFactories?, scenarios? })` →
  `AgentModels` with:
  - `language(role, { agentId })` and `languageFallbacks(role)`;
  - `embedding()`, wrapped with `defaultEmbeddingSettingsMiddleware`, so every call carries
    `google.outputDimensionality = 1536` (`openai.dimensions` for OpenAI). Vertex also reads
    the `google` key (checked in the installed code). The options are also exposed as
    `embeddingProviderOptions`;
  - `transcription()` and `speech()`, which return `null` when the provider key is missing;
  - `registerFakeScenario`.

  Fake mode never builds a real provider (tested with recording factories).
- `EMBEDDING_DIMENSIONS = 1536` in `model-roles.ts`.
- `model-prices.ts`: `PRICES_VERIFIED_AT = 2026-09-29`. Source: ai.google.dev pricing page,
  Standard paid tier, page updated 2026-09-24:
  - `google/gemini-3.5-flash`: $1.50 in / $9.00 out per 1M tokens;
  - `google/gemini-3.5-flash-lite`: $0.30 in / $2.50 out.

  `gemini-embedding-001` is no longer listed, and voice models are not per-token, so both are
  absent (cost `null`). `estimateCostMicroUsd` rounds up. Cached tokens are priced as input,
  which can only overestimate.
- Fakes (`src/models/fake/`):
  - `fake-language-model.ts`: `LanguageModelV4` (types checked in `@ai-sdk/provider` 4.0.19).
    It picks one of:
    - a summary of the tool result when the last message is a tool result;
    - directives `text`, `tool-call`, `reasoning`, `error` and `slow`;
    - per-agent keyword rules;
    - a hash echo.

    It emits `stream-start`, `response-metadata` (fixed timestamp), text and reasoning in
    16-char deltas, tool input start/delta/end plus `tool-call`, `error`, and `finish` with
    usage derived from characters. It uses `simulateReadableStream` with no timers (a delay
    only with `[[fake:slow]]`). A malformed directive throws `InvalidFakeDirectiveError`.
  - `fake-structured-output.ts`: answers `responseFormat: json` calls. Detectors are
    recognized by the shape of their result schema (Mastra 1.71 `PromptInjectionResult`,
    `ModerationResult`, `PIIDetectionResult`, `SystemPromptDetectionResult`) and flag only on
    `[[fake:injection]]`, `[[fake:moderation]]` or `[[fake:pii]]`. Other calls get the minimal
    object the schema allows. `[[fake:json {...}]]` scripts the answer.
  - `fake-embedding-model.ts`: SHA-256 bucket bag of words, 1 + ln(tf), L2-normalized; empty
    text maps to a unit vector.
  - `fake-voice-models.ts`: `fake transcript <n> bytes` and a 0.1 s silent 16 kHz WAV.

## Task 6: `FirebaseMastraAuth`

- SP1's access services were not committed (only contracts landed during this run), so
  `src/runtime/runtime-ports.ts` mirrors the SP1 spec shapes:
  - `AccessPort`:
    - `verifyBearer({ token, checkRevoked })`: returns a principal, or `null` (401);
    - `resolveAccessContext({ principal, node })`: returns the context, or `null` when there
      is no membership;
    - `authorize` (with `ceiling`);
    - `getEffectivePermissions`.
  - `AuditPort`, `ApprovalPort`, `UsagePort`, `KnowledgePort`, `ConnectorsPort`,
    `SecretStore` and `SettingsPort`, grouped as `AgentRuntimePorts`.

  Task 7 binds them in `apps/mastra/src/runtime/create-runtime-ports.ts`. SP1's `verifyBearer`
  may take the HTTP method instead of `checkRevoked`; the binding adapts it.
- `src/testing/fake-ports.ts` (`@core/agents/testing`) holds in-memory fakes for every port.
  They follow SP1 rules: key owner grants, ceiling intersection, `requiresApproval`.
- `auth/bearer-only.ts` uses Mastra's `getRequestHeader` / `getWebRequest`. `checkRevoked`
  is false only for GET and HEAD; an unknown method is checked.
- `auth/agent-principal.ts`:
  - `AgentPrincipal` has `kind`, `uid`, the SP1 `principal`, `tenantId | null`, the project
    and unit, `isMember`, `permissions`, `regional | null` and `activeScreen`;
  - `nodeFromScope`: a unit header without a project header names no node (fail-closed);
  - `resourceIdOf`: `tenantId:uid`, or `unscoped:uid` when no tenant is forwarded. This keeps
    Mastra's mapper from answering 500, and `authorizeUser` answers 403 right after.
- `auth/firebase-mastra-auth.ts`:
  - `mapUserToResourceId` is passed through `super()`; a test checks it is an own property;
  - `authenticateToken` returns `null` unless the raw header carries exactly this Bearer
    token, so `?apiKey=` is refused;
  - device principals are refused (`null`) because they have no user to act for;
  - `authorizeUser` requires a membership plus `core.chat.use`, or `core.mcp.use` under
    `/api/mcp/`.
- Follow-up 12c: a new regression case in `services-env.schema.test.ts` checks that
  `FIREBASE_AUTH_EMULATOR_HOST` is rejected with `APP_ENV=prod`.
- `firebase-mastra-auth.emulator.test.ts` signs up real Auth Emulator users, verifies their
  tokens with firebase-admin (`createFirebaseAdmin`) and takes memberships from the fake
  port. It serves `new Mastra({ server: { auth, apiRoutes } })` through `createNodeServer`
  (`@mastra/deployer` 1.71.0, new catalog pin in the same train as core) and checks:
  - 200 with `resourceId` `tenantId:uid`;
  - 401 without a token, with a garbage token, with a `?apiKey=`-only token, and with a
    revoked token;
  - 403 for a member without `core.chat.use`, for a non-member, and without a tenant header.
- New `@core/agents` dependencies: `@core/contracts`, `@mastra/core` (catalog 1.71.0), and
  `@mastra/deployer` as a dev dependency. New export `./testing`.

### Mastra release train

`npm view` at about 21:55 -03 gives `@mastra/core` 1.72.0 and `@mastra/server` /
`@mastra/deployer` 1.72.0 (published 2026-09-30 00:03Z), `mastra` 1.31.4 and `@mastra/pg`
1.28.0. These releases are less than 3 hours old: pnpm's release-age window holds them back,
and a bump is a workspace-wide change of its own. The pins stay on 1.71.0, and
`@mastra/deployer` was added at 1.71.0 to match.

## Verification (fresh runs after the last commit)

```
pnpm -F @core/contracts test          → Test Files 26 passed, Tests 261 passed
pnpm contracts:check                  → contracts:check ok (73 contracts, 57 endpoints, 149 files)
pnpm -F @core/agents test -- models   → Test Files 8 passed, Tests 71 passed (the filter is not applied; the whole unit project runs)
pnpm -F @core/agents test             → Test Files 8 passed, Tests 71 passed
pnpm -F @core/agents typecheck / lint → clean
pnpm -F @core/mastra typecheck        → clean; pnpm -F @core/mastra test → Tests 22 passed
pnpm -F @core/services exec vitest run --project unit src/services/shared → 14 files, 91 tests passed
pnpm test:emulators                   → scripts 2, functions 4, services 18, agents 6 tests passed; "Script exited successfully (code 0)"
git diff --quiet main -- .contexts .claude && echo framework-ok → framework-ok
```

A full `pnpm -F @core/services test` also showed two failing files. Both belong to SP1's
untracked, in-progress `src/services/access/domain/*` and are unrelated to SP3.

## Concerns

1. **SP3 permissions are not in `CORE_PERMISSIONS` yet.** SP1 committed
   `access/core-permissions.ts` (`5d35ef5`) after Task 4, without the spec §2.2 permissions.
   `AGENT_PERMISSIONS` (`contracts/agents/agent-permissions.ts`) matches the
   `PermissionDefinition` shape. One change is needed once SP1 is idle: spread it into
   `CORE_PERMISSIONS`, or map it through SP1's `tenant()` helper. This file was not edited
   because SP1 owns it and was active.
2. **The runtime ports follow the SP1 spec text, not code.** Task 7's binding must adapt names
   and signatures, especially `verifyBearer` (method vs `checkRevoked`) and
   `resolveAccessContext`'s no-membership result.
3. **`connectors.Connector` rejects `http`, IP literals and single-label hosts.** Task 22's
   local in-process MCP server test has to use a test-only path (connector registry input)
   rather than a stored `Connector`, or the contract needs a local-only allowance.
4. **Detector verdict fakes are derived from Mastra 1.71 result types.** They were not yet
   exercised through the real `PromptInjectionDetector` / `PIIDetector` processors; Task 17
   must check them end to end.
5. **Device credentials get 401 on Mastra** (not in the spec, which lists `user` and
   `service` only). Revisit if desktop devices need chat.
6. **Price table covers only the two Gemini text models.** Embedding, voice and any other
   configured model cost `null`, and the budget counts tokens for them.
7. The Mastra 1.72 train and the `@ai-sdk/openai` release-age exclusion (remove after
   2026-10-06) are described above.
