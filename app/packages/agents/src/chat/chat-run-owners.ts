/**
 * Owners of chat runs (SP4 spec §4.2, decision 0031). Resume, stop and approval responses name
 * a run id; Mastra's own observe route and the native approval path trust that id, so the chat
 * routes check here that the run belongs to the caller's resource (`tenantId:uid`) and thread.
 * In-process, like the durable agent's replay cache it guards (single instance until a shared
 * cache exists).
 */

export type ChatRunState = "running" | "suspended" | "finished";

/** The text of the member's message that started a run (attachments are not kept in memory). */
export type PendingUserMessage = { readonly id: string; readonly text: string };

export type ChatRunOwner = {
  readonly resourceId: string;
  readonly threadId: string;
  readonly agentId: string;
  /** The message the run answers; memory stores it only when the run ends. */
  readonly userMessage?: PendingUserMessage | undefined;
};

export type ChatRunEntry = ChatRunOwner & { readonly state: ChatRunState; readonly recordedAt: number };

export type ChatRunOwners = {
  readonly record: (runId: string, owner: ChatRunOwner) => void;
  readonly ownerOf: (runId: string) => ChatRunEntry | undefined;
  readonly markState: (runId: string, state: ChatRunState) => void;
  readonly isOwnedBy: (runId: string, caller: { readonly resourceId: string; readonly threadId: string }) => boolean;
  /**
   * The message of the thread's newest run while that run has not finished, so a history read in
   * the middle of an answer (a reload that resumes it) shows the question too.
   */
  readonly pendingMessageOf: (caller: {
    readonly resourceId: string;
    readonly threadId: string;
  }) => PendingUserMessage | undefined;
  /** The thread's newest run of the caller stopped at a tool approval nobody answered yet. */
  readonly awaitsApproval: (caller: { readonly resourceId: string; readonly threadId: string }) => boolean;
};

/** Mastra `server.timeout` (15 min): no chat stream outlives it. */
const DEFAULT_TTL_MS = 15 * 60_000;
const DEFAULT_MAX_RUNS = 10_000;

/**
 * @param options.ttlMs how long a run is remembered after it was recorded (a suspended run waits
 *   for its approval that long).
 * @param options.maxRuns cap of remembered runs; the oldest go first.
 */
export const createChatRunOwners = (
  options: { readonly ttlMs?: number; readonly maxRuns?: number; readonly now?: () => number } = {},
): ChatRunOwners => {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const maxRuns = options.maxRuns ?? DEFAULT_MAX_RUNS;
  const now = options.now ?? Date.now;
  const runs = new Map<string, ChatRunEntry>();
  const live = (runId: string): ChatRunEntry | undefined => {
    const entry = runs.get(runId);
    if (entry === undefined || now() - entry.recordedAt <= ttlMs) return entry;
    runs.delete(runId);
    return undefined;
  };
  // Insertion order: the last match is the thread's newest run; another resource's run is not the caller's.
  const newestOf = (caller: { readonly resourceId: string; readonly threadId: string }) => {
    let newest: ChatRunEntry | undefined;
    for (const runId of [...runs.keys()]) {
      const entry = live(runId);
      if (entry !== undefined && entry.threadId === caller.threadId) newest = entry;
    }
    return newest?.resourceId === caller.resourceId ? newest : undefined;
  };
  return {
    record: (runId, owner) => {
      runs.delete(runId);
      runs.set(runId, { ...owner, state: "running", recordedAt: now() });
      // Map iteration is insertion order: the first key is the oldest run.
      while (runs.size > maxRuns) runs.delete(runs.keys().next().value as string);
    },
    ownerOf: live,
    markState: (runId, state) => {
      const entry = live(runId);
      if (entry !== undefined) runs.set(runId, { ...entry, state });
    },
    isOwnedBy: (runId, caller) => {
      const entry = live(runId);
      return entry !== undefined && entry.resourceId === caller.resourceId && entry.threadId === caller.threadId;
    },
    pendingMessageOf: (caller) => {
      // Older runs are ignored even when they never reported their end: their message is in memory by then.
      const newest = newestOf(caller);
      return newest === undefined || newest.state === "finished" ? undefined : newest.userMessage;
    },
    awaitsApproval: (caller) => newestOf(caller)?.state === "suspended",
  };
};

type ApprovalPart = {
  readonly toolCallId?: unknown;
  readonly state?: unknown;
  readonly approval?: { readonly id?: unknown };
};

const SEPARATOR = "::";

/**
 * Run ids named by responded approvals (`approval.id` is `<runId>::<toolCallId>`, as
 * `@mastra/ai-sdk` reads it); a part whose tool call id does not match is ignored there too.
 */
export const approvalRunIdsOf = (parts: readonly unknown[]): string[] => {
  const runIds = new Set<string>();
  for (const part of parts as readonly ApprovalPart[]) {
    const id = part.approval?.id;
    if (part.state !== "approval-responded" || typeof id !== "string") continue;
    const at = id.lastIndexOf(SEPARATOR);
    if (at <= 0 || id.slice(at + SEPARATOR.length) !== part.toolCallId) continue;
    runIds.add(id.slice(0, at));
  }
  return [...runIds];
};
