# 0076. Engineering conventions review (2026-10-06): fixes, accepted deviations and deferred items

- **Status:** accepted
- **Date:** 2026-10-06
- **Scope:** the whole `app/`, `.github/workflows/app-ci.yml`, `.github/CODEOWNERS`, `.gitleaks.toml`; the
  framework in `.contexts/` is unchanged
- **Relates to:** decision 0004 (Functions env files), decision 0013 §7 (RTL), decision 0042 (admin console UI)

## Context

After PR #2 merged, the app was reviewed against `.contexts/engineering` (rules, contracts, architecture,
practices, stacks and processes), area by area. Every finding was checked in the code and against
decisions 0001–0075 before acting. This decision records what changed, and why the rest did not.

## Decision

### Fixed

1. **API.**
   - Every query schema is a `z.strictObject`, so an unknown filter answers 400 instead of being ignored
     (rules/api-design §6).
   - The calls that cost money or start work accept `Idempotency-Key` (`optional`): `evals.startExperiment`,
     both prompt evaluations, `schedules.runNow` and `admin.runScheduleNow`.
   - Two `Location` headers named routes that do not exist (device activation, impersonation session);
     they are dropped. Creating a schedule now returns its `Location`.
2. **Hexagonal dependency rule.** `CHUNKS_V1_DIMENSIONS` moved to `knowledge/domain` and `SYSTEM_ACTOR` to
   `audit/domain`, so no use case loads Drizzle or `firebase-admin` at runtime.
3. **Determinism and observability.**
   - The `FILE_UPLOADED` event id is assigned by the publisher, not the use case.
   - The storage trigger logs once, in the driving adapter, with the delivery's `eventId`.
   - Console routes put `requestId` in their error envelopes and logs.
   - The Mastra middlewares answer with the api.md §6 envelope.
   - A failed connector status write is logged instead of dropped.
   - The read-only database connector throws a coded error and never passes a raw DNS message to the model.
4. **Timeouts.** The conversation summary (60 s, also aborted by the client) and each embedding batch
   (60 s) have a deadline.
5. **Client.**
   - Sign-out also clears the support session a tab opened.
   - Lists of labels use `Intl.ListFormat` and sorts use `Intl.Collator`.
   - Physical direction utilities (`ml-*`, `pl-*`, `left-*`, `text-left`, `border-l`, ...) became logical
     ones, so decision 0013 §7 (RTL needs no refactor) holds again.
   - The settings, profile and admin routes each import only their own views. A member opening settings no
     longer downloads the admin console and its charts, which is the premise decision 0042 relies on.
6. **Process.**
   - CI scans each push and PR for secrets with gitleaks (pinned version and SHA-256, `.gitleaks.toml`
     allows only example values and test doubles). Decision 0004 said such a check existed; until now it
     did not. There is no pre-commit hook: the repository has no hook manager, and the CI scan blocks the
     merge.
   - `@core/services` and `@core/functions` unit tests also run on Node 24, the Functions runtime.
   - `.github/CODEOWNERS` covers the critical areas. It has one owner today; governance asks for two, to be
     added when the team has a second reviewer.
   - `evals:publish` validates its environment.
   - `.env.example` lists the optional tooling variables.
   - The BigQuery README records the plural table names.

### Accepted deviations (not changed)

- **`Transaction` from `firebase-admin/firestore` in ports** (type-only, about 37 files). Every unit of
  work is Firestore's, and there is no second adapter that an opaque handle would serve. Revisit when one
  of these contexts gets another store.
- **Timestamps from the injected clock, not `serverTimestamp()`.** It keeps tests deterministic and gives
  cursor pagination the value it wrote. The audit log keeps server time.
- **Enum values in kebab-case** (`pending-approval`, `chat-attachment`, `platform-admin`, ...). This is
  the app-wide convention, used the same way in claims, URLs and storage; data-modeling's snake_case is
  not applied.
- **Actor and change fields.**
  - `sessions` have no `updatedAt`; `lastSeenAt`, `revokedAt` and rotation record each change.
  - Message feedback has `userId` as its actor.
  - The file settle and the example notes write no `updatedBy`.
  - Postgres `updated_at` is set by each repository UPDATE, not a trigger.
  - `tenant_budgets` and `prompt_versions` have no `updated_by`; the Firestore audit log records who changed them.
- **Naming and data.**
  - `exported_until` keeps its name, since columns are not renamed in place.
  - The unused `'deleted'` document status goes with the next knowledge migration.
  - The units child query filters by `projectId` (an opaque id, authorized first) without `tenantId`.
- **Process.**
  - `apps/web` allows Node 24 until the App Hosting spike decides its runtime.
  - The full Playwright suite runs on every PR to `main`, by choice, until it slows merges.
  - The impersonation banner labels stay in `sessionStorage` (staff tab only, cleared on sign-out and with
    the tab).
- **Schema location.** Repository-local `Stored*` schemas and one use-case input schema stay where they are.

### Deferred (their own change)

- **Cross-context deep imports and application code importing `composition.ts` types.** About 150
  imports; they move to each context's `index.ts` and `application/ports`, together with a lint rule that
  enforces it.
- **Lists that grow without limit.**
  - Prompt versions and activations need cursor pages.
  - Eval datasets past 100 and schedules need `hasMore`.
- **Branded run, schedule, dataset, item and experiment ids.**
- **Event envelope.** `FILE_UPLOADED` and `KNOWLEDGE_DOCUMENT_INDEXED` get the full events.md envelope and
  Zod schemas with the event bus (decisions 0019, 0022).
- **Fixed sleeps in a few tests.** They move to `expect.poll` or fake timers.
- **Mastra packages behind `latest`.** The held Mastra and OpenTelemetry packages move together once
  pnpm's release-age window passes (2026-10-07).

## Alternatives rejected

- **Fix everything in one change.** The deferred items each touch dozens of files with no behaviour
  change; mixing them with the fixes would hide both in review.
- **Add the opaque transaction handle now.** It needs casts in every adapter for one store.
- **A pre-commit hook framework only for secret scanning.** It is a new dev dependency, and the CI scan
  already gates the merge.

## Consequences

- An unknown query parameter now answers 400. The typed clients never send one.
- New secrets are caught before merge. New example values must live in the allowed paths or be added to
  `.gitleaks.toml`.
- The deferred list is the backlog of the next conventions pass.
