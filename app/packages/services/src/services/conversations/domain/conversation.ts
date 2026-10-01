import { type ChatAgentId, type Conversation, type ConversationId, type ConversationPatch, MAX_TITLE_CHARS, type ProjectId, type TenantId, type UserId } from "@core/contracts";
import { buildSearchTokens } from "./search-tokens.ts";

/**
 * Rules of the `conversations` context (SP4 spec §4.1, decision 0033). Pure: no I/O.
 */

/** Mastra `server.timeout`: no chat stream outlives it, so an older active run is stale. */
export const ACTIVE_RUN_TTL_MS = 15 * 60_000;
/** Concurrent chat streams per tenant (spec §6). */
export const MAX_ACTIVE_STREAMS_PER_TENANT = 5;
/** Turns of one exchange: the user message and the answer. */
export const MESSAGES_PER_TURN = 2;

export type NewConversation = {
  readonly id: ConversationId;
  readonly tenantId: TenantId;
  readonly projectId: ProjectId | null;
  readonly ownerId: UserId;
  readonly agentId: ChatAgentId;
};

/** A new, untitled conversation owned by its creator. */
export const createConversation = (input: NewConversation, now: Date): Conversation => {
  const at = now.toISOString();
  return {
    ...input,
    title: null,
    titleSource: "auto",
    summary: null,
    pinned: false,
    archivedAt: null,
    deletedAt: null,
    lastMessageAt: at,
    messageCount: 0,
    activeRunId: null,
    activeStreamStartedAt: null,
    searchTokens: [],
    createdAt: at,
    updatedAt: at,
  };
};

/** Owner-only in v1: another member, or a deleted conversation, reads as missing. */
export const isVisibleTo = (conversation: Conversation, ownerId: string): boolean => conversation.ownerId === ownerId && conversation.deletedAt === null;

/** The run streaming now, unless it started more than 15 minutes ago (its stream is gone). */
export const liveActiveRunId = (conversation: Conversation, now: Date): string | null => {
  if (conversation.activeRunId === null || conversation.activeStreamStartedAt === null) return null;
  return now.getTime() - Date.parse(conversation.activeStreamStartedAt) < ACTIVE_RUN_TTL_MS ? conversation.activeRunId : null;
};

/** Fields a patch changes (rename sets `titleSource: user`; archive stamps `archivedAt`). */
export const applyConversationPatch = (conversation: Conversation, patch: ConversationPatch, now: Date): Conversation => {
  const at = now.toISOString();
  const title = patch.title ?? conversation.title;
  return {
    ...conversation,
    title,
    titleSource: patch.title === undefined ? conversation.titleSource : "user",
    pinned: patch.pinned ?? conversation.pinned,
    archivedAt: patch.archived === undefined ? conversation.archivedAt : patch.archived ? (conversation.archivedAt ?? at) : null,
    searchTokens: buildSearchTokens({ title, summary: conversation.summary }),
    updatedAt: at,
  };
};

/** Names of the fields a patch sets, for the audit trail and logs (never values). */
export const changedFieldsOf = (patch: ConversationPatch): string[] =>
  Object.entries(patch)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key)
    .toSorted();

/** How a run ended: the run, when, and the memory thread title Mastra generated (if any). */
export type RunEndFacts = { readonly runId: string; readonly endedAt: string; readonly title?: string };

/**
 * The conversation after a run's stream closed (with or without `finish`): the run is cleared
 * and the turn counted only when it is still the active one, and an automatic title is copied
 * from the memory thread while the owner has not renamed the conversation.
 */
export const endRunOf = (current: Conversation, end: RunEndFacts): Conversation => {
  const ownsRun = current.activeRunId === end.runId;
  const copied = current.titleSource === "auto" && end.title !== undefined && end.title.trim() !== "" ? end.title.trim().slice(0, MAX_TITLE_CHARS) : current.title;
  return {
    ...current,
    // Only the end that clears the run counts the turn (a stop and the stream's close both end it).
    ...(ownsRun ? { activeRunId: null, activeStreamStartedAt: null, messageCount: current.messageCount + MESSAGES_PER_TURN, lastMessageAt: end.endedAt } : {}),
    title: copied,
    searchTokens: copied === current.title ? current.searchTokens : buildSearchTokens({ title: copied, summary: current.summary }),
    updatedAt: end.endedAt,
  };
};
