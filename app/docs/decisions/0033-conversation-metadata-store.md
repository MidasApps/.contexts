# 0033. Conversation metadata in Firestore, messages in Mastra memory

- **Status:** accepted
- **Date:** 2026-09-30
- **Scope:** `app/packages/services/src/services/conversations`, `app/firestore.rules`, `app/firestore.indexes.json` (local decision; the framework is unchanged)
- **Records:** SP4 spec D4-05 (§4.1, §7)
- **Relates to:** decision 0029 (memory: `threadId = conversationId`, `resourceId = tenantId:uid`)

## Context

The history sidebar needs listing, search, pin, archive and realtime updates. The messages
already live in Mastra memory (Postgres); duplicating them would create two sources of truth.

## Decision

**D4-05.** Firestore `conversations/{autoId}` holds metadata only; the document id is the Mastra
thread id. Fields: `tenantId`, `projectId`, `ownerId`, `agentId`, `title`, `titleSource`,
`summary?`, `pinned`, `archivedAt?`, `deletedAt?`, `lastMessageAt`, `messageCount`,
`activeRunId?`, `activeStreamStartedAt?`, `searchTokens` (≤ 50 normalized tokens of title and
summary), `createdAt`, `updatedAt`. Messages exist only in Mastra memory and are read through
`toAISdkMessages(…, { version: 'v7' })`. Search is `searchTokens array-contains-any`. Delete is
soft (`deletedAt`) plus the Mastra thread delete; a job purges after 30 days (SP5). Clients may
read their own conversations (rules); every write goes through `/v1`.

## Consequences

- Realtime lists without polling; no message duplication.
- Search is token based (no full text); enough for titles and summaries.

## Alternatives rejected

- **Messages in Firestore too.** Two sources of truth and extra cost.
- **Metadata in Postgres.** No realtime listeners for the client; tenancy rules already live in Firestore.

## Amendments


- **2026-10-01 — the client side: route, history and right panel (SP4 Task 13).**
  - **Route.** The chat is a page of a project: `/o/:organizationId/p/:projectId/chat/:conversationId?`
    (route id `chat`), not the top-level `/chat` of the plan. A conversation needs an organization (and
    takes a project), the route map names both in the path (decision 0012 §3), and the navigation item
    sits in the `project` slot, which only resolves inside a project. The conversation is URL state: the
    panel names a new conversation and the view replaces the URL with it. Web:
    `(app)/o/[organizationId]/p/[projectId]/chat/[[...conversationId]]`; desktop: one TanStack file
    route with an optional param (`chat/{-$conversationId}.tsx`).
  - **History.** `GET /v1/conversations` as an infinite cursor list in the query cache (search after a
    300 ms pause, archived behind a toggle); every action invalidates the lists, because order, membership
    and search words all come from the server. The Firestore listener the rules allow is not used: the
    client does not use the Firestore SDK, and a list that refreshes after each turn is enough for one owner.
  - **Right panel.** The apps pass `CHAT_SHELL_SLOTS` to `createClientApp`. The shell slot gained
    `useRightPanelAvailable`: the chat panel is offered inside a project, to a member with
    `core.conversation.send`, and not on the chat page. It starts closed and opens from a topbar button;
    its content mounts only while open.

- **2026-10-01 — naming a conversation is a same-page navigation (SP4 Task 14).** The browser run
  showed duplicate React keys and a second chat panel in the page: on the web, replacing the route
  with the new `conversationId` changed a dynamic segment, so the App Router built a second page
  whose thread loaded the conversation and resumed the run while the first one still streamed.
  `RouterPort.navigate` gained `samePage` (with `replace`): the web adapter writes the address with
  `history.replaceState`, which Next keeps in sync with `usePathname` without building the page again;
  the desktop (TanStack Router keeps the route component for a param change) and the memory router
  navigate as before. A thread that resumes a run also drops the stored copy of the answer in flight,
  which the replayed stream sends again under the same message id. The history is read again as soon
  as a turn settles (the run is cleared on the server before the stream closes), on top of the 4 s
  poll while a row says it is answering.
- **2026-10-01 — the agent of a conversation (decision 0046, follow-up 72).** The panel header offers
  `GET /v1/chat-agents` while the conversation is new and sends the choice as `agentId`; a stored
  conversation shows its agent instead (the server keeps it). History rows and answers carry the
  agent's name; an agent no longer listed is shown as "the organization's agent".
