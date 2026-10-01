# SP4 gate (Tasks 14 and 15)

Plan: `docs/plans/2026-09-29-sp4-chat.md`. Spec: `docs/superpowers/specs/2026-09-29-sp4-chat-design.md` §1.
Branch `feat/agentic-app-core-sp0`. Date 2026-10-01. Worked in the worktree `wt-sp4-e2e`, rebased
three times onto the moving head and fast-forwarded.

## Gate criteria → evidence

Spec §1: *Playwright e2e with `AI_MODE=fake`: streaming, delegation, `renderForm` → submit, approval
with audit, upload, voice, history. axe clean on the chat page.* The brief added navigation, stop and
resume, approve/reject, the approvals link, the uncertain badge, voice hidden behind its flag, error,
offline and no-permission states, a clean console in every journey, and the agent picker.

| Criterion | Evidence (spec · test) | Result |
|---|---|---|
| Open chat from project navigation | `chat-streaming` · opens from the project navigation… | pass |
| Streaming states then the answer | same test: `connecting`/`responding` in words, the answer, the address gains the conversation id while streaming, axe | pass |
| Stop | `chat-streaming` · stops an answer in the middle (partial text, "Interrompido", focus back, history no longer "Respondendo") | pass |
| Resume | `chat-streaming` · resumes a streaming answer after a reload, with the question still on screen | pass |
| Delegation | `chat-streaming` · uncertain badge (delegation card to the knowledge agent); form journey (data and action agents) | pass |
| Low-confidence badge during the live stream | `chat-streaming` · marks an answer without a source as uncertain while it is still streaming | pass |
| `renderForm` → submit → approval with before/after → approve → audit | `chat-form-approval` · a submitted form asks for approval… (`AGENT_TOOL_CALL_APPROVED`, `AGENT_TOOL_EXECUTED`, `MODULE_RECORD_CREATED`) | pass |
| Reject runs nothing | `chat-form-approval` · a declined call runs nothing and keeps the reason (`AGENT_TOOL_CALL_DECLINED`, no new record) | pass |
| Four-eyes approval linked to `/o/{organizationId}/settings/approvals/{id}` | `chat-form-approval` · a command that needs a second member… (link href, opens the inbox page) | pass |
| Upload shown in the sent message; invalid file refused | `chat-upload` · both tests (Storage + Functions emulators, magic bytes) | pass |
| Voice | `chat-voice` · push-to-talk with Chromium's fake microphone → transcript in the draft, not sent; read aloud plays | pass |
| Voice hidden while the flag is off | `chat-streaming` · shows no voice control while the organization's voice flag is off | pass |
| History: list (generated title), rename, pin, search, summarize, archive, restore, delete | `chat-history` · lists a new conversation…; renames, pins, searches… | pass |
| Reopen with earlier messages and scroll kept | `chat-history` · reopens a long conversation (52 messages, "load earlier", anchor stays in view) | pass |
| Error, offline, no-permission states | `chat-streaming` · failure, offline, without permission; `chat-history` · history error with reference and retry | pass |
| Agent picker (decision 0046) | `chat-agents` · skill and agent created in /settings, picked in chat, answer under the agent's name, disabled agent not offered | pass |
| Same widget on desktop | `apps/desktop/e2e/desktop-chat.spec.ts` (desktop-web) | pass |
| Clean console in every journey | `chat-test.ts` auto fixture `consoleGuard` (errors, warnings, page errors; a journey declares only failed loads it causes on purpose) | pass |
| axe clean on the chat page | `expectNoAxeViolations` in streaming, history, form, upload, agents and desktop journeys | pass |

Note on the console guard: the e2e web is a production build, so React's development-only warnings
(duplicate keys) cannot appear there; they are covered by component tests. The duplicate key itself
was traced to its cause in a browser (see item 1).

## E2E runs (final code, `pnpm test:e2e -- node <scratchpad>/run-chat.mjs`: turbo build with the e2e env, then `playwright test --project=chat --workers=2` on web and `desktop-chat.spec.ts` on desktop)

```
run 2 (tree 5f623d6 minus the web proxy test fix, same code)   web 24 passed (3.6m) · desktop 2 passed (38.1s) · exit 0
run 3 (5f623d6)                                                 web 24 passed (2.7m) · desktop 2 passed (32.5s) · exit 0
```

Run 1 of the session crashed a browser target while the machine was short of memory (4 workers);
the next run found the desktop CORS bug (item below), fixed in `9926309`.

## Brief items

1. **Duplicate React key — fixed (`6d2a343`).** Cause found in the browser: the web named a new
   conversation with `router.replace` to a new value of a dynamic segment, so the App Router built a
   second chat page (two `chat-panel`s in the DOM) whose thread loaded the conversation and resumed the
   run while the first one kept streaming. Second source: a resumed thread kept the stored copy of the
   answer in flight, which the replayed stream sends again under the same id. Fix: `RouterPort.navigate`
   `samePage` (web: `history.replaceState`), `withoutAnswerInFlight` before resuming, `uniqueMessages`
   removed. Tests: web adapter, panel resume test with a `console.error` spy. Decision 0033 amended.
2. **Stale "Respondendo" — fixed and checked in the browser.** The panel tells the view when a turn
   settles and the history is read again at once (`6d2a343`); e2e asserts no "Respondendo" after an
   answer and after a stop.
3. **Approval-requests 500 — not reproduced.** Every probe (fork with `next dev`, e2e journeys
   including a stored request with a preview) answered 200/403/404. Regression emulator test
   `4f9b7d1`. Follow-up 78.
4. **Title in fake mode — fixed (`1f36def`).** Mastra writes the title ~400 ms after the stream
   closes and `/v1` read it once; an untitled conversation now asks up to 6 times, 250 ms apart. The
   fake title model names the conversation after the member's message. e2e asserts the title.
5. **Client suite — fixed (`607ee27`).** `AdminAgentPromptsView` was not hung (21/21 in 27 s alone,
   slowest test 1.5 s): CPU starvation from one jsdom worker per core. `maxWorkers: "50%"`,
   `testTimeout: 15000`. Full run: 229 files, 1144 tests passed in 282 s.
6. **`mastra dev` and the Functions emulator — fixed.** `da2dd9c`: `loadInstructions` also looks in
   the package source seen from the `.cache` bundle (`mastra dev` ready on a fresh worktree, no
   `INSTRUCTIONS_NOT_FOUND`). `0eb89d2`: `pnpm dev` passes `FUNCTIONS_DISCOVERY_TIMEOUT=180` unless
   the shell sets one; the e2e env sets it too.
7. **Desktop build — fixed with documented values (`d4d78f2`).** `.env.production` stays unversioned
   on purpose (a release must not ship placeholders); `apps/desktop/.env.production.example` is
   versioned and a clean `vite build` fails with `MissingDesktopEnvFileError` naming the file to copy.
   Verified: without the file → that error; with the example copied → built.
8. **Local desktop uploads — fixed (`8607e12`).** `VITE_STORAGE_EMULATOR_URL` (loopback, local only)
   joins the Tauri `connect-src`. Found by the e2e: the web did not expose `x-conversation-id` to
   cross-origin clients, so the desktop never learned a new conversation's id (`9926309`).
9. **Lint — clean** on the final tree (below).

Other fixes the e2e exposed: the question of a running turn missing after a reload (`62208c8`), the
active history row at 4.34:1 contrast (`79a93ee`), a fake rule to run a named command
(`1f36def`), the e2e stack with Storage, Functions, the agent runtime and its own database
(`f750add`).

## Verification (final tree `b6baafb`)

```
pnpm -F @core/client test        → 229 files, 1144 passed (282 s)
pnpm -F @core/contracts test     → 37 files, 424 passed
pnpm -F @core/agents test        → 82 files passed, 1 skipped; 612 passed, 1 skipped
pnpm -F @core/services test      → 138 files, 957 passed
pnpm -F @core/web test           → 11 files, 75 passed (after b6baafb; the run before it failed the CORS header expectation)
pnpm -F @core/desktop test       → 15 files, 87 passed
pnpm -F @core/mastra test        → 14 files, 66 passed
pnpm typecheck                   → 13/13 tasks successful
pnpm lint                        → 13/13 tasks successful
pnpm i18n:check                  → ok (10 namespaces, 30 catalogs)
pnpm contracts:check             → ok (148 contracts, 165 endpoints, 299 files)
pnpm -F @core/web build          → exit 0, 107/107 static pages (with a temporary .env.local copied from .env.example)
pnpm -F @core/desktop build      → MissingDesktopEnvFileError without .env.production; built with the example copied
git diff --quiet main -- .contexts .claude && echo framework-ok → framework-ok
```

## Deviations

1. The chat journeys run in their own Playwright project `chat` (chromium, `--workers=2` in the runs
   above), not on the four-browser matrix (follow-up 80).
2. The plan's spec files were merged by journey: `chat-streaming`, `chat-history`,
   `chat-form-approval`, `chat-upload`, `chat-voice`, `chat-agents` (no separate `chat-delegation`).
3. Upload "add to knowledge base → later answer cites it" is not in e2e (knowledge ingestion needs
   the embedding pipeline on the e2e database); covered by unit tests of Task 11.
4. The upload spec warms the Functions trigger in `beforeAll` (follow-up 79).
5. Picker unit tests were written alongside the implementation, not before it.

## Concerns

1. Item 3 is not reproduced; only a regression test exists.
2. Once, under memory pressure, the four-eyes journey ended in the error state; it passed in every
   later run. Not diagnosed further.
3. React development warnings are not observable in the production e2e build.
4. Another agent's e2e stack shares the machine; runs used isolated temp folders (`1ba20e9`) and the
   default e2e ports while theirs used others.

Processes: every server and emulator this work started was stopped; ports 3100, 4191, 1420 and the
e2e emulator ports were free at the end. Scratch database `app_e2e` is the e2e run's own database
(recreated and migrated by `pnpm test:e2e`).
