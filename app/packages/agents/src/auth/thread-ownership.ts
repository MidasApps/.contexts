import type { MastraCompositeStore } from "@mastra/core/storage";

/**
 * Memory thread ownership (SP3 spec §10, decision 0029). A thread belongs to one
 * resource (`tenantId:uid`). Mastra refuses a foreign thread only deep inside the
 * run (a 500 on `generate`), so the context middleware checks first and answers
 * 403 before any model or memory work.
 */

/** Owner resource of a thread; `null` when the thread does not exist yet (the run creates it). */
export type ThreadOwnerLookup = (threadId: string) => Promise<string | null>;

/** Lookup over Mastra's memory storage domain (`mastra_threads`). */
export const threadOwnerFromStorage =
  (storage: MastraCompositeStore): ThreadOwnerLookup =>
  async (threadId) => {
    const memory = await storage.getStore("memory");
    const thread = await memory?.getThreadById({ threadId });
    return thread?.resourceId ?? null;
  };

const THREAD_PATH = /\/memory\/threads\/([A-Za-z0-9_-]{1,128})(?:\/|$)/;

/** Thread ids a request names: the forwarded conversation id and a `/memory/threads/:threadId` path. */
export const threadIdsOfRequest = (input: {
  readonly path: string;
  readonly conversationId: string | undefined;
}): string[] => {
  const fromPath = THREAD_PATH.exec(input.path)?.[1];
  return [...new Set([input.conversationId, fromPath].filter((id): id is string => id !== undefined))];
};

export type ThreadAccess = "allowed" | "forbidden" | "unavailable";

/**
 * Whether `resourceId` may use every thread the request names.
 * A lookup failure is `unavailable` (fail-closed), never `allowed`.
 */
export const checkThreadAccess = async (input: {
  readonly lookup: ThreadOwnerLookup;
  readonly threadIds: readonly string[];
  readonly resourceId: string;
}): Promise<ThreadAccess> => {
  try {
    for (const threadId of input.threadIds) {
      const owner = await input.lookup(threadId);
      if (owner !== null && owner !== input.resourceId) return "forbidden";
    }
    return "allowed";
  } catch {
    return "unavailable";
  }
};
