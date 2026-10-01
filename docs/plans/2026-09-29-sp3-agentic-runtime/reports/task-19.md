# SP3 Task 19 report: contract command tools and the example module command

Plan: `docs/plans/2026-09-29-sp3-agentic-runtime.md` (Task 19). Branch `feat/agentic-app-core-sp0`. Date 2026-10-01.

## Commits

| Commit | Message |
|---|---|
| `f0004d1` | `feat(agents): derive mutation tools from command contracts` |
| this commit | `docs(agents): record sp3 task 19 decisions, report and progress` |

Both were made in the main tree. I staged only my own paths. `pnpm-lock.yaml` held only my two
importer hunks when I staged it (`apps/mastra` and `modules/example`).

## What changed

**One command registry (decision 0025 amendment).**

- `defineContractCommand` (`@core/services`, `services/agents/application/commands/contract-command.ts`)
  declares a command from its contract. The id, description, permission and input schema come from
  the contract. A contract that is not `kind: "command"`, or has no `permission`, is a boot error.
- The value is the single definition of the command. Three things use it:
  - the agent tool `command.<contractId>`, derived in `@core/agents` (`tools/commands/command-tools.ts`)
    from the new port `commandRegistry`;
  - the SP1 `agent-command` approval handler, in `/v1`;
  - the workflow command port.
- The core command `tenancy.CreateProjectInput` is now a registry entry. Its hand-written tool,
  `ProjectsPort` and the binding in `apps/mastra` are removed. This ends the double definition
  that `task-20-22.md` and `task-23-25.md` reported. The tool id did not change.
- The use case now receives the idempotency key (`runId:toolCallId`, or `workflow:<runId>`).
- Two entries with one command id fail at boot (`DuplicateCommandError`). Before, the second
  silently replaced the first.
- The workflow command port refuses a command whose permission needs four eyes
  (`APPROVAL_REQUIRED`). Before, it ran such a command after a plain `authorize()`.

**Example module (`modules/example`).**

- Permissions `example.note.read`, `example.note.create` and `example.note.archive`. The archive
  permission has `requiresApproval: true`. Messages exist in the three locales.
- Contracts `example.CreateNoteCommand` and `example.ArchiveNoteCommand` are in `EXAMPLE_CONTRACTS`,
  so they are in the catalog, the AI catalog and OpenAPI. `CreateNoteCommand` has the same shape
  as the `approval-demo` input (`title` 1–200, optional `body` up to 10 000).
- Use cases `createNote` and `archiveNote` over Firestore `notes`: automatic ids, `tenantId`,
  `authorize()`, and the audit entry in the same transaction. Security Rules deny `notes` to every
  client.
- The package exports `./server` (`createExampleCommands`) and `./agents`
  (`createExampleAgentModule`).
- `EXAMPLE_CAPABILITIES` now names the skill `example-notes` and the workflow
  `example-note-intake`, each with its implementation. `agents` and `tools` stay empty: the
  module's agent tools are its command contracts.
- `example-note-intake` creates a note through the workflow command port. It is startable from
  `/v1/workflows/example-note-intake/runs`.

**Composition.**

- `apps/mastra/src/modules.ts`: `APP_MODULES` entries are `{ manifest, createCommands,
  createAgentModule }`. `createAgentRuntime` registers the manifests in the runtime's core server,
  builds the registry and then builds the agent modules over the ports. Before, the runtime's core
  server did not know module permissions, so every `example.*` authorization would have failed.
- `apps/web/src/server/modules.ts` (`createModuleCommands`) adds the module commands to the
  approval handler's registry, so an approved module command runs in `/v1`.
- `defineAgentModule` now also checks the manifest's `skills` and `workflows` refs.

**Contracts.**

- `AUDIT_ACTIONS` gains `MODULE_RECORD_CREATED` and `MODULE_RECORD_UPDATED`. `target.type` names
  the record kind (`example-note`), so a module needs no audit action of its own in the core.
- `example.Note` gains the optional field `archivedAt`.

## TDD

I did not follow red → green strictly. The tests were written in the same step as their code, and
most passed on their first run, so I did not see them fail first:

- `contract-command.test.ts` and `command-tools.test.ts` were written before their modules but
  first run after them;
- the `defineAgentModule` skill and workflow cases, `manifest.test.ts`, `example-commands.test.ts`,
  `example-agent-module.test.ts`, `create-note.emulator.test.ts`, and the `APPROVAL_REQUIRED` and
  duplicate-id cases were written together with their code.

The failures I did see:

- `module-commands.emulator.test.ts`: the viewer case failed once, on my own fixture (the context
  `userId` did not match the principal);
- `catalog-reindex.workflow.postgres.test.ts`: a failure that already existed (concern 10).

## Verification (fresh, main tree, 2026-10-01)

Node 26.10.0, pnpm 12.6.0. Docker Desktop was not running; I started it and brought the compose
Postgres up (`core-postgres-1`), then ran `pnpm db:migrate`. Emulators ran from a scratch config on
my own ports (auth 45099, firestore 45080, ws 45150, storage 45199, hub 45400, logging 45500); the
file was not committed.

```
turbo run test (6 packages)       → services 125 files / 846, agents 73 / 528 (1 skipped), mastra 13 / 64,
                                    module-example 5 / 30, contracts 36 / 411, web 11 / 72: all passed
turbo run typecheck lint (services, agents, mastra, module-example, contracts, functions) → clean
pnpm -F @core/web typecheck       → clean
turbo run test:postgres --concurrency=1 → services 8 files / 44 passed; agents 7 / 27 passed
firebase emulators:exec --only auth,firestore,storage "turbo run test:emulators --concurrency=1 --continue"
                                  → mastra 8 files / 36 passed; module-example 1 / 3; agents 1 / 6; scripts 1 / 2;
                                    services 36 of 37 files (see concern 5), 37 / 187 on the rerun;
                                    functions 6 failed (see concern 6)
AI_MODE=fake pnpm evals           → 7 files, 7 passed
pnpm contracts:check              → ok (132 contracts, 142 endpoints, 267 files)
pnpm i18n:check                   → ok (10 namespaces, 30 catalogs)
pnpm -F @core/mastra build        → build successful; output pins match the lockfile; audit: no high or critical
built server (PORT=4196, fake mode, scratch emulators) → GET /health 200 {"success":true};
                                    POST /api/agents/assistant/generate without a token 401
git diff --quiet main -- .contexts .claude && echo framework-ok → framework-ok
```

Key evidence, all on the production composition (`createAgentRuntime` with `APP_MODULES`):

- **`workflow-hitl.emulator.test.ts`.** The member starts `approval-demo` through the `/v1`
  gateway. The member's own approval is refused. After the admin approves, the run status is
  `success`, the result is `applied`, and Firestore `notes` holds one note whose `authorId` is the
  member. SP5's "note created" no longer needs a test executor.
- **`module-commands.emulator.test.ts`.**
  - The runtime registers `command.example.CreateNoteCommand`, `command.example.ArchiveNoteCommand`
    and the workflow.
  - A create call writes one note with the tenant from the server context. A second call with the
    same tool call id returns the same note id and writes nothing. The audit log has
    `MODULE_RECORD_CREATED` and `AGENT_TOOL_EXECUTED`, and never the note text.
  - A viewer is refused, and so is an input that carries a `tenantId`.
  - An archive call answers `pending-approval`. The requester's own approval is refused. After the
    admin approves in a second core server (the `/v1` side), the note is archived as the requester.
    A second approval answers `CONFLICT`.
  - `example-note-intake` creates a note as the caller.

## Deviations and concerns

1. **Module commands are registry entries, not `AgentModule.commands`.** The plan writes
   `defineAgentModule({ commands: [{ contract, handler, preview }] })`. A handler needs Firestore,
   access and audit, and `/v1` must run the same handler, so the module exports a command factory
   and both apps add it to the registry. `AgentModule.commands` still exists for a module that
   defines a tool directly.
2. **`APP_MODULES` changed shape** (`{ manifest, createCommands, createAgentModule }`). Tests that
   pass `modules: APP_MODULES` to `createAgentRuntime` compile unchanged.
3. **The approval handler stays in `@core/services`**, where `task-23-25.md` put it. The plan names
   `packages/agents/src/approvals/`.
4. **Two generic audit actions were added to the core enum** (`MODULE_RECORD_CREATED`,
   `MODULE_RECORD_UPDATED`) instead of note-specific ones. A module that needs another verb (a
   delete, for example) still needs a core change.
5. **One services rules test failed once.** `firebase-rules.emulator.test.ts` ("denies reading an
   existing Firestore document") failed in the first full emulator run. It passed alone and in a
   second full services run. I did not find the cause.
6. **`@core/functions` emulator tests were not run.** They need the Functions emulator, which my
   scratch config does not start. I changed no Functions code; its typecheck and lint are clean.
7. **`next build` of `apps/web` was not run.** Other agents are editing the web client. The web
   typecheck and unit tests pass. `apps/web` lint fails on `src/client/section-pages.tsx`, which is
   another agent's uncommitted file.
8. **`@core/client` is now an optional peer of the module.** As a dependency it put the client and
   the Firebase web SDK into the Mastra build output, and the output audit failed on a high
   advisory (`@grpc/grpc-js` under `firebase`).
9. **A use case refusal now reaches the model as `COMMAND_REFUSED`.** The old create-project tool
   answered `FORBIDDEN`. No test or eval depended on the old code.
10. **A pre-existing Postgres test was wrong.** `catalog-reindex.workflow.postgres.test.ts`
    asserted that no rendered contract contains the word "Example", and `example.ExampleSettings`
    (SP2) broke it. It now checks for an examples heading.
11. **Notes have no `/v1` endpoint or page** (follow-up #38), and module command tools ignore
    module enablement (follow-up #39).
12. **The module skill reaches only organizations that enabled the module.** The core default
    `enabledAgents` does not name `example`, so by default no organization sees `example-notes`.
