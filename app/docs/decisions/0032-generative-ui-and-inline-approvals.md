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
- **2026-09-30 — the audit of an inline decision (SP4 Task 5).** `/v1/chat` accepts an assistant
  message only when it carries approval responses (`state: approval-responded`, `approval.id` =
  `<runId>::<toolCallId>` of the part's own tool call), and forwards only those fields. Before
  forwarding, it writes `AGENT_TOOL_CALL_APPROVED|DECLINED` per decision: target the conversation,
  metadata `runId`, `toolCallId` (new allowlisted key) and `toolId` (the sanitized tool name of the
  part, `agent-action` when the supervisor delegated the command), actor, and the member's `reason`.
  An audit failure answers 500 and nothing is forwarded. The permission is not in this entry: `/v1`
  only has the client's copy of the part; `AGENT_TOOL_EXECUTED`, written by the tool pipeline when
  the call runs, carries it.
- **2026-10-01 — the client side (SP4 Task 10).**
  - **Registry.** `features/generative-ui` pairs each `CHAT_UI_COMPONENTS` schema with its component
    (`CORE_UI_COMPONENTS`); modules add entries through `ChatPanel` `uiComponents` and cannot replace a core
    id. An unknown id, props the schema rejects, a form whose contract the client does not have, or a
    component that throws while rendering all show the generic tool view, and report one
    `GenerativeUiError` (code and component id only, never the props) to the app's `reportError`.
  - **Where a component comes from.** `catalog.renderForm` runs inside the data subagent, so its
    `{ ui: { component, props } }` arrives in `subAgentToolResults` of the `tool-agent-data` part, not as a
    part of its own. The chat reads the output of the part and of every subagent tool call. A command
    output `{ status: "pending-approval", approvalId }` is shown as `approval-pending`.
  - **How the member's answer travels — a user turn, not a tool output.** The spec had `addToolOutput` for
    a submitted form or a picker choice. That cannot work with this backend: the tool already returned
    (server-executed), a nested call has no part to answer, and `ChatRequest` accepts only text in a user
    message and only approval responses in an assistant message. The answer is therefore the next user
    turn, written by `formatUiSubmission`: a marker (`[ui:schema-form]` / `[ui:picker]`), one instruction
    sentence for the agent, and the values as a JSON block. The chat shows that turn as a chip
    ("Formulário enviado: …"), not as JSON. The form validates with the command contract before sending;
    the agent still has to call the command, which asks for approval. Sending is behind
    `GenerativeUiEnvironment.submit`, so a backend that later accepts tool outputs changes one function.
  - **Forms need the command contract on the client.** `defineClientModule({ contracts })` and
    `ModuleRegistry.contracts()` carry module contracts; `ChatPanel` `contracts` receives them. The form
    renders `commandId` (the command's input) and falls back to `contractId`.
  - **Approval card.** `features/chat-approval` renders the AI Elements `Confirmation` for any tool part
    with an `approval`: title and summary from `data-tool-preview`, the permission, the arguments of
    `data-tool-call-approval`, and the before/after as the `approval-diff` component (fields of `after`
    that differ from `before`). Approve sends at once; decline asks for an optional reason (≤ 500
    characters) first. A decision is sent once, only from the latest turn and never while an answer
    streams; `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses` posts it. A
    failed post keeps the answered part and "Tentar novamente" sends it again as it is.
  - **Approvals inbox link.** `approval-pending` links to `approvalHref(approvalId)`; the default is
    `/approvals/{approvalId}` as a plain href, because the route map has no approvals route yet. The app
    passes a router-built href once SP5 adds that route.
