# 0025. Contract-derived command tools, confirmation and four-eyes approval

- **Status:** accepted
- **Date:** 2026-09-29
- **Scope:** `app/packages/agents/src/tools` (`defineCoreTool`, `commands/command-tools.ts`), SP1 approval requests (local decision; the framework is unchanged)
- **Records:** SP3 spec D3-11 (§8.1, §8.4); umbrella spec §16.4

## Context

The action agent executes module commands (mutations). A mutation triggered by a model must never run without the user's confirmation, must pass the same authorization as the UI, and some permissions (`requiresApproval`) need a second person. Retries of an approved call must not execute twice.

## Decision

1. Each module command becomes a tool `command.<contractId>` whose input schema is the command contract's schema (strict), with its `description` and `permission` (a command contract without `permission` is a boot error). Execution goes through the same use case and SP1 `authorize()` as `/v1`.
2. **User confirmation always:** every `kind: 'mutation'` tool sets `requireApproval: true` (Mastra tool approval, approve/decline in the stream).
3. **Four eyes when SP1 says so:** when `authorize()` returns `requiresApproval: true`, `defineCoreTool` creates an SP1 approval request of kind `agent-command` (handler registered by SP3 in SP1's `ApprovalActionHandler` registry) instead of executing, and returns `{ status: 'pending-approval', approvalId }`. SP1 executes at most once after an approver decides. An approval port error or an unregistered handler fails closed (`APPROVAL_UNAVAILABLE`).
4. The handler receives `{ principal, input, idempotencyKey }` with `idempotencyKey = runId:toolCallId`.
5. Every mutation is audited (`AGENT_TOOL_EXECUTED`: tool id, permission, input hash, outcome), never with the raw input.

## Consequences

- A tool definition cannot opt out of confirmation for mutations.
- SP5 approval UI and SP4 chat approval UI share the same SP1 approval requests.
- Mutation tools are not exposed over MCP in v1 (decision 0027).

## Alternatives rejected

- **Mastra tool `suspend()` for four eyes.** State would live in the agent run snapshot, not in SP1's audited, at-most-once approval store, and approvers would need the chat run.
- **Tool hooks `beforeToolCall`/`afterToolCall` for authorize/audit.** Two places for the same guard; `defineCoreTool` covers core and module tools in one place.
- **Model-provided confirmation flag.** Model output never authorizes anything.

## Amendments

- **2026-09-30 — SP1 approvals bound, handler and command idempotency (follow-up #26).**
  - *Where the handler lives.* SP1 decides approvals in `/v1` (`apps/web`), and the web does
    not depend on `@core/agents`. The `agent-command` handler is therefore in `@core/services`
    (`services/agents/application/commands/`), not in `@core/agents` as the plan said. Both
    `apps/web` (`runtime-routes.ts`, where approvals are decided and the command runs) and
    `apps/mastra` (`create-runtime-ports.ts`, where SP1's `requestApproval` checks that the kind
    has a handler) register it with `registerAgentCommandApprovals`; a second registration on
    the same registry is a no-op.
  - *Executors.* The handler runs commands through `AgentCommandExecutor`s (command id,
    permission, input schema, execute). Today there is one, `tenancy.CreateProjectInput` → SP1
    `createProject`, which mirrors the agent tool `command.tenancy.CreateProjectInput`; module
    executors join when Task 19 lands. The two definitions of the core command are a known
    duplication until module command contracts are derived from one source.
  - *Handler checks* (each refusal throws a SCREAMING_SNAKE code that SP1 audits on
    `APPROVAL_FAILED`; nothing runs after a failed check): the requester still resolves
    (`REQUESTER_UNAVAILABLE`) and is the uid the action names (`REQUESTER_MISMATCH`); the
    action's tenant and permission equal the approved request's (`TENANT_MISMATCH`,
    `PERMISSION_MISMATCH`); an executor exists for the command with that permission
    (`UNKNOWN_COMMAND`); SP1 `authorize()` still allows the requester at the request's node
    (`REQUESTER_FORBIDDEN`); the input parses with the command schema
    (`COMMAND_INPUT_INVALID`); the use case accepts it (`COMMAND_REFUSED`).
  - *Port binding.* `ApprovalPort.requestApproval` now carries the run's `requestId`. It maps
    to SP1 `requestApproval({ principal, input: { node, permission, action: { kind:
    "agent-command", input: <AgentApprovalRequest>, summary } }, requestId })`; SP1 answers a
    `Result`, and `ok: false` rejects with SP1's code, so the tool answers
    `APPROVAL_UNAVAILABLE`; `approvalId` is the stored request's id. A platform node is refused
    before SP1 is called.
  - *Idempotency store.* Commands run at most once per `runId:toolCallId` through SP1's
    `IdempotencyStore` (decision 0009: Firestore `idempotency-records`, 24 h TTL, 60 s in-flight
    lease; record id `sha256("tenant:<tenantId>:agent-command:<commandId>:<key>")`, result kept
    as JSON). The Mastra tool pipeline routes every mutation through it (new port
    `commands`), and the handler uses the same records, so a retried approval or a retried tool
    call replays the stored result. The same key with another input is
    `IDEMPOTENCY_KEY_REUSED`; a call while the first still runs is `COMMAND_IN_PROGRESS`; a
    store failure is `IDEMPOTENCY_UNAVAILABLE` (fail-closed, nothing runs). A replayed tool
    call is audited again with `replayed: true` in the port metadata (SP1's audit allowlist
    keeps only the tool id, run id, input hash and error code).
- **2026-10-01 — one command registry; module commands (SP3 Task 19).**
  - *One definition per command.* `defineContractCommand({ contract, targetContractId,
    outputSchema, execute, summarize?, preview? })` (`@core/services`,
    `services/agents/application/commands/contract-command.ts`) declares a command from its
    contract: id, description, permission and input schema come from the contract. A contract
    that is not `kind: "command"` or has no `permission` is a boot error
    (`CommandContractError`). The value (`ContractCommand`) is an `AgentCommandExecutor` plus
    the data a tool needs, so it ends the duplication noted in the amendment above.
  - *Three consumers, one entry.* The agent tool `command.<contractId>` is derived from the
    entry (`@core/agents` `tools/commands/command-tools.ts`, port `commandRegistry`); the SP1
    `agent-command` approval handler and the workflow command port run the same entry. The
    core command `tenancy.CreateProjectInput` is now such an entry
    (`createCoreAgentCommandExecutors`); `create-project-command.tool.ts`, `ProjectsPort` and
    its binding are removed. The tool id is unchanged. A use case refusal reaches the model as
    `COMMAND_REFUSED` (before: `FORBIDDEN`).
  - *Registry composition.* `apps/mastra` (`create-runtime-ports.ts`) and `apps/web`
    (`runtime-routes.ts`) build the registry as core commands plus the installed modules'
    command factories. Two entries with one id are a boot error (`DuplicateCommandError`).
  - *Idempotency key reaches the use case.* `AgentCommandExecution` carries `idempotencyKey`
    (`runId:toolCallId`, or `workflow:<runId>`), as §4 says; at-most-once is still enforced
    by the idempotency store around the call.
  - *Workflows never skip four eyes.* The workflow command port refuses a command whose
    permission needs approval (`APPROVAL_REQUIRED`). A workflow that needs such a command asks
    for its own approval first (decision 0036) and applies a command without that flag.
  - *Module audit actions.* A module's use cases audit `MODULE_RECORD_CREATED` and
    `MODULE_RECORD_UPDATED` (new entries of `AUDIT_ACTIONS`); `target.type` names the record
    kind (`example-note`), so a module needs no action name of its own in the core. The
    agent pipeline still audits `AGENT_TOOL_EXECUTED` for the call.
  - *Example module.* `example.CreateNoteCommand` (`example.note.create`) and
    `example.ArchiveNoteCommand` (`example.note.archive`, `requiresApproval`) over Firestore
    `notes` (`tenantId`, automatic ids). An archive requested through the agent becomes an SP1
    approval request and runs in `/v1`, as the requester, after a different member approves.
- **2026-10-06 — delete action for module records.** A module's use cases audit a deletion as
  `MODULE_RECORD_DELETED`, next to `MODULE_RECORD_CREATED` and `MODULE_RECORD_UPDATED`: in the same
  transaction as the delete and without `changes`, as `ROLE_DELETED` and `CUSTOM_AGENT_DELETED` are
  written. `target.type` still names the record kind. Archiving stays an update
  (`changes: ["archivedAt"]`), so the example module, which deletes nothing, does not use the new
  action. Its label is in the three catalogs (decision 0074).
