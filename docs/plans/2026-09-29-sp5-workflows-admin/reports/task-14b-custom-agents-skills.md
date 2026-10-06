# SP5 Task 14b report: tenant-defined agents and skills

Plan: `docs/plans/2026-09-29-sp5-workflows-admin.md`. Branch `feat/agentic-app-core-sp0`. Date 2026-10-01.
Decision: `app/docs/decisions/0046-tenant-defined-agents-and-skills.md` (amends 0045 §2).

## Commits

| Message |
|---|
| `feat(contracts): add tenant-defined agents and skills` |
| `feat(agents): run tenant-defined agents on one generic agent` |
| `feat(services): add custom agents and skills use cases and routes` |
| `feat(web): serve the custom agent and skill endpoints` |
| `feat(mastra): bind the custom agents port and test it end to end` |
| `feat(client): create and edit organization agents and skills` |
| `fix(agents): let the owner stop a run of a disabled custom agent` |
| `docs(agents): report sp5 task 14b` |

One coordinator (contracts, decision, runtime, Mastra binding, end-to-end test) and two forks
(services + web routes + rules; client + i18n) in one worktree. Forks made no git writes.

## Answer to "can I create agents? skills?"

- **Agents: yes.** An organization admin creates, edits, enables, disables and deletes agents in
  `/settings/agents`: name, description, instructions, model role (`chat` or `reasoning`), tools,
  the connectors' read-only tools, platform skills, the organization's own skills and a knowledge
  scope. A member chats with an enabled agent by starting a conversation with its id.
- **Skills: yes.** An admin creates, edits, enables, disables and deletes skills (name, description,
  markdown instructions) in `/settings/skills` and attaches them to the organization's agents.
- **Not yet:** the chat UI has no agent picker (the data is served by `GET /v1/chat-agents`), and
  the assistant does not delegate to an organization's agent. Both are stated in the page copy and
  in follow-up 72.

## Capability → screen → endpoint → status

| Capability | Screen | Endpoint | Status |
|---|---|---|---|
| Create an agent | `/settings/agents` | `POST /v1/agents` | works |
| Edit, enable, disable an agent | `/settings/agents` | `GET`, `PATCH /v1/agents/{agentId}` | works |
| Delete an agent | `/settings/agents` | `DELETE /v1/agents/{agentId}` | works |
| See custom agents with their tools and skills | `/settings/agents` | `GET /v1/agents` (`source: "custom"`) | works |
| Models, tools, platform skills, limits and their use | editors | `GET /v1/agent-options` | works |
| Create, edit, enable, disable, delete a skill | `/settings/skills` | `GET`, `POST /v1/skills`, `GET`, `PATCH`, `DELETE /v1/skills/{skillId}` | works |
| Attach a skill to an agent | agent editor | `customSkills` / `coreSkills` of the agent | works |
| Chat with a custom agent | none (API) | `POST /v1/chat` with `agentId`; `GET /v1/chat-agents` lists the choices | works through the API; no picker in the chat UI |
| The assistant delegates to a custom agent | none | none | missing (direct selection only) |
| Plan caps | editors show use and cap | `PlanLimits.maxCustomAgents`, `maxCustomSkills`, `maxCustomInstructionChars` (defaults 5, 10, 8000) | works; `/admin/plans` does not edit them (follow-up 76) |

Reads need `core.agent-settings.read`, writes `core.agent-settings.update`, chat `core.chat.use`.

## How it runs

- Records: Firestore `custom-agents` and `custom-skills` (automatic ids, `tenantId`), denied to
  every client by the rules.
- Runtime: one registered Mastra agent `custom-agent` and its durable wrapper run every custom
  agent. The chat route loads the caller's tenant's enabled record, writes its id to a server-only
  context key and runs the generic agent. Same auth, tenant context, memory (`tenantId:uid`),
  `entry` guardrails, budget guard, usage ledger, approvals and kill-switch as the assistant.
- The organization's instructions go after the platform preamble `custom.v1.md`, inside the
  delimited section whose closing tag is neutralized.
- Ceiling: the tool pipeline asks a per-run ceiling (the selected tools' permissions inside the
  union of the shipped subagents' ceilings); it is empty without a loaded record.
- `custom-agent` and `custom-agent-chat` are hidden from `/api/agents/*`.
- Cache: 60 s per (tenant, agent); `/v1` asks the runtime to drop the tenant's entries after a write.

## Verification (worktree, Node 26.10.0, after the rebase onto `09af02a1`)

`pnpm -F <pkg> <script>` fails in this worktree (it cannot write
`node_modules/.pnpm-task-run-state-v1/...`; probably the path length), so package commands ran
inside each package directory. Tests ran with `--maxWorkers=4`.

```
contracts  vitest run                     → 37 files, 424 tests passed
services   vitest run --project unit      → 137 files, 942 tests passed
agents     vitest run --project unit      → 82 files passed, 1 skipped; 603 tests passed, 1 skipped
mastra     vitest run --project unit      → 14 files, 66 tests passed
web        vitest run                     → 11 files, 73 tests passed
client     vitest run                     → 227 files, 1127 tests passed
typecheck  contracts, services, agents, client, mastra, web, functions, desktop → exit 0
lint       the same eight → exit 0
pnpm contracts:check                      → ok (148 contracts, 165 endpoints, 299 files)
pnpm i18n:check                           → ok (10 namespaces, 30 catalogs)
AI_MODE=fake evals (@core/agents)         → exit 0
web        next build                     → exit 0 (needs app/.env.local; it fails without it,
   and when the file is sourced into the shell, which sets a non-standard NODE_ENV)
mastra     build                          → exit 0 (agent assets present, audit: no high/critical)
git diff --quiet main -- .contexts .claude → framework-ok
```

Before the rebase, with the default workers and other agents running, the client suite failed 95
tests in 74 files (82 timeouts at 5 s, none in a file of this task) and one agents test timed out
at 5 s; both passed with four workers. After the rebase the worktree's `node_modules` lost its
links once (cause unknown); a clean install fixed it, and the typecheck, lint, checks, evals and
builds above are from after that install.

Emulators on scratch ports (auth 46099, firestore 46080), after the rebase:

```
services  custom-agents emulator tests   → 2 files, 15 tests passed
   rules: anonymous, an owner of the tenant and a member of another tenant are denied reads and
   writes on custom-agents and custom-skills; repositories: cross-tenant get reads as missing,
   lists are tenant-filtered
mastra    custom-agents.emulator.test.ts → 5 tests passed
   create skill → create agent using it → catalog and options → member chats with it in fake mode →
   messages in memory → usage rows of the organization in Postgres → another organization gets 404
   on get, update, delete, chat and a direct runtime call, and sees nothing in its lists → disable
   stops the next message at once → delete
mastra    v1-chat.emulator.test.ts       → 5 tests passed alone (before the rebase); one timing test
   failed once when run in parallel with the file above
```

**Not run:** the other emulator suites, Postgres suites, e2e (Playwright), a browser pass of the
two pages, the pages against a running `/v1`, the desktop build.

## TDD

- Red seen first: the per-run ceiling in the tool pipeline, the usage ledger test for durable
  spans, the custom agent integration test (red three times: the model resolver threw outside a
  run, the ledger missed the run, the test harness has no memory), the Firestore index test.
- Written together with the code: the loader, tools and route unit tests, the contract tests,
  the services route tests (fork A), the client view and editor tests (fork B).

## Concerns

1. **A billing bug was found and fixed.** Durable chat runs (`assistant-chat`) never reached the
   usage ledger: in `@mastra/core` 1.71.0 the generation span of a durable agent ends without a
   request context, and the exporter skipped it. The exporter now keeps the context of the span's
   own start event by span id (at most 5000 open spans). Every `/v1/chat` turn of the assistant is
   billed from now on; budgets will fill faster than before. The SP3 gate did not catch it because
   it calls the non-durable `/api/agents/assistant/stream`. If a run ends on another instance than
   the one that started it, the row is still skipped (logged `usage_span_without_tenant`).
2. **Files of the chat agent's folder changed** (it will meet them on rebase):
   `packages/agents/src/chat/{chat-http,chat-routes,observe-route,history-routes,abort-route}.ts`
   (one helper `durableIdOf` and two optional fields of `ChatRuntime`), and `ChatAgentIdSchema` is
   now `"assistant" | CustomAgentId`. No client chat path was edited.
3. **No picker and no delegation** (follow-up 72).
4. **Usage and traces name `custom-agent`**, not the individual agent (follow-up 73).
5. **No versions or evals for a custom agent**; an edit is live at once. The preamble is not in the
   prompt store (follow-up 74).
6. **Cache invalidation reaches one runtime instance**; others lag up to 60 s (follow-up 75).
7. **Caps are counted before the write**, and `/admin/plans` does not edit them (follow-up 76).
8. **Model allowlist is two roles; web tools and module skills cannot be selected; MCP connector
   tools are not capped by the per-run ceiling** (as for the assistant) (follow-up 77).
9. **Tool ids are validated by the runtime, not by `/v1`**: an unknown id is stored and ignored at
   run time; the editor only offers known ones.
10. **A non-member of an organization gets 404, not 403**, on these endpoints (the shared hidden
    deny reason).
11. **The pages were not opened in a browser.**
12. **`ASSISTANT` name and description in `GET /v1/chat-agents`** are English literals from services.

## Follow-ups (`docs/plans/2026-09-29-sp0-app-foundation/follow-ups.md`)

58 marked done · 72 picker and delegation · 73 usage and traces per custom agent · 74 versions,
evals and the preamble in the prompt store · 75 invalidation across instances · 76 plan form and
transactional caps · 77 model ids, web tools, module skills, MCP ceilings.
