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
