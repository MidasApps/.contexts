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
