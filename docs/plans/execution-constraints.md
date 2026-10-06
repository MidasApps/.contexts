# Execution constraints (all subagents, all subprojects)

Every implementer, reviewer and planner working on the agentic core reads this file
first. It exists so task briefs stay short and consistent.

## Framework is read-only

- `.contexts/` and `.claude/` are the DDC framework. Never create, edit or delete
  anything in them, including `.claude/agent-memory/progress.md`.
- Read them as doctrine (SSOT). When the app needs a decision the doctrine doesn't
  cover or must deviate from, record it in `app/docs/decisions/NNNN-<slug>.md`
  (short MADR: context, decision, consequences, alternatives).
- Every task ends with `git diff --quiet main -- .contexts .claude && echo framework-ok`.

## Where things go

- Code: `app/` (pnpm + Turborepo workspace root). Layout: umbrella spec §3
  (`docs/superpowers/specs/2026-09-29-agentic-app-core-design.md`).
- Plans: `docs/plans/YYYY-MM-DD-<slug>.md`; reports in
  `docs/plans/YYYY-MM-DD-<slug>/reports/`; progress in
  `docs/plans/YYYY-MM-DD-<slug>/progress.md`; cross-SP follow-ups in
  `docs/plans/2026-09-29-sp0-app-foundation/follow-ups.md`.
- Never mention any specific business domain; the core is generic.

## Toolchain (this machine)

- Every Bash command starts with
  `export PATH="/c/Users/gsoar/AppData/Local/node-v26.10.0-win-x64:$PATH"`
  (Node 26.10.0 + pnpm 12.6.0; the system Node 24 must not be used).
- Docker, Java 21 and Rust (rustup; `rust-toolchain.toml` pins 1.98.1) exist.
- **Port 3000 belongs to another project of the user. Never kill any process you
  did not start yourself.** Use `WEB_PORT=3100` for web. Before killing a process,
  confirm it is in the process tree you spawned.
- Local Postgres: `cd app && docker compose up -d --wait` (container `core-postgres-1`).
- Emulators: `cd app && pnpm exec firebase emulators:exec --project demo-core --only <list> "<cmd>"`.
- Throwaway probes go in the session scratchpad, never in `app/`.

## Versions

- Measure with `npm view <pkg> version` before adding a dependency; pin exactly via
  `catalog:` in `app/pnpm-workspace.yaml` (ADR 0004: latest stable; exceptions
  E1–E5; `@mastra/evals` and `@mastra/auth-firebase` are not adopted).
- pnpm 12 blocks build scripts: add explicit `allowBuilds` entries with a reason.

## Code rules (summary; the rules in `.claude/rules/` and `.contexts/engineering/` win)

- TDD (red → green), tests colocated `*.test.ts`; emulator tests `*.emulator.test.ts`,
  Postgres tests `*.postgres.test.ts`; e2e in `e2e/*.spec.ts` (Playwright 1.63).
- Handlers: auth → validate → authorize → act. `/v1` accepts only
  `Authorization: Bearer`. Error envelope `{ error: { code, message, details?, requestId } }`.
- Zod 4 schemas are the single source of types; contracts live in `@core/contracts`
  with catalog metadata (`defineContract`, see `app/docs/decisions/0005-*`).
- Firestore: automatic IDs, `tenantId` on tenant-scoped docs, camelCase. Postgres:
  `uuidv7()`, snake_case, `timestamptz`, money as `amount_minor bigint` + `currency`.
- Logs JSON via the shared logger; never `console.log` elsewhere; no PII in logs.
- Files ≤ 500 lines, functions ≤ 50, named exports (framework-mandated defaults
  commented), imports via package names / aliases.
- UI copy never hard-coded: i18n keys (`pt-BR` source, `en-US`, `es-419`).
- UI: shadcn/ui (new-york, Radix base) + Tailwind 4 with tokens from
  `.design-system/DESIGN.md`; AI Elements for chat. Accessibility WCAG 2.2 AA.

## Git

- Branch `feat/agentic-app-core-sp0` (no push). Conventional Commits; scopes are
  bounded contexts or areas (`access`, `tenancy`, `identity`, `client`, `web`,
  `desktop`, `agents`, `mastra`, `knowledge`, `chat`, `workflows`, `admin`,
  `contracts`, `services`, `i18n`, `workspace`, `ci`, ...) — never `app`/`core`/`misc`.
- Every commit message ends with a blank line and
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- If `.git/index.lock` exists, wait until it disappears; never delete it. Stage only
  your own files (`git add <paths>`, never `git add -A`); other agents may be working.

## Reporting

Implementers return only:

```
STATUS: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED
COMMITS: <shas>
TESTS: <commands> → <summary>
CONCERNS: <none or list>
REPORT: <path>
```
