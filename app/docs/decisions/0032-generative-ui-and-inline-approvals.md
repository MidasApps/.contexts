# 0032. Generative UI and inline tool approvals

- **Status:** accepted (D4-04 path chosen by the SP4 Task 1 spike; see Amendments)
- **Date:** 2026-09-30
- **Scope:** `app/packages/contracts/src/contracts/chat/ui`, `app/packages/client/src/features/{generative-ui,chat-approval}`, `app/packages/agents/src/chat`, `/v1/chat` (local decision; the framework is unchanged)
- **Records:** SP4 spec D4-03, D4-04 (§4.4, §5.2, §7)
- **Relates to:** decision 0025 (agent command tools and approvals)

## Context

Tools render forms, tables, charts and pickers inside the chat, and mutation tools stop for
user approval (decision 0025). Model output is untrusted, so props must be validated before
rendering, and every approval decision must be audited.

## Decision

1. **D4-03 — generative UI.** A tool declares `ui.component`; its props are a `ui-component`
   contract in `@core/contracts` (`chat/ui/*.schema.ts`: `schema-form`, `data-table`, `chart`,
   `approval-diff`, `picker`, `approval-pending`). The client validates the props with the same
   schema; an unknown component or invalid props falls back to the generic `Tool` view and never
   throws. Modules add components through `defineModule()` client manifests.
2. **D4-04 — approvals.** Mastra emits `tool-call-approval`; the client renders AI Elements
   `Confirmation` with the tool title, permission and the `data-tool-preview` written before the
   approval. Path A (native AI SDK approval: `addToolApprovalResponse`, and the next
   `POST /v1/chat` carries it) is used when the spike proves it; otherwise path B:
   `POST /v1/chat/{id}/tool-approvals` → Mastra approve/decline → continuation stream. `/v1`
   audits `AGENT_TOOL_CALL_APPROVED|DECLINED` (conversation, tool call, permission, actor) before
   forwarding. Four-eyes permissions return `{ status: 'pending-approval', approvalId }` and the
   chat renders an `approval-pending` card linking to the approvals inbox (SP5).

## Consequences

- Rendering is data-driven and typed; a bad tool output degrades to a plain view.
- Approvals are matched by the sanitized tool name Mastra streams (`command_tenancy_CreateProjectInput`).

## Alternatives rejected

- **Model-emitted JSX or HTML.** Unsafe and unvalidated.
- **Approval only in the SP5 inbox.** Breaks the chat flow for single-user approvals.

## Amendments

- **2026-09-30 — path A proven (SP4 Task 1 spike).** With `closeOnSuspend: true`, the chat stream
  ends at the suspension with `tool-approval-request`. Its `approvalId` is `<runId>::<toolCallId>`,
  and it comes with `data-tool-call-approval`, which carries the sanitized tool name and the
  arguments. The next `POST` carries the assistant message with the part in `approval-responded`.
  `handleChatStream` resumes the durable run and executes the tool once. Replaying the same
  approval answers an error chunk and never runs the tool twice.
  - `/v1/chat` audits the decision before forwarding it.
  - The Mastra route refuses an approval whose `runId` belongs to another owner.
  - Path B (`/v1/chat/{id}/tool-approvals`) is not built.
  - `data-tool-preview` (summary, permission, before/after) is emitted by the chat route next to
    `data-tool-call-approval`, from the tool definition's `summarize` and `preview`.
