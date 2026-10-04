import { createStep, createWorkflow } from "@mastra/core/workflows";
import type { Memory } from "@mastra/memory";
import { z } from "zod";
import type { ConversationPurgePort } from "../runtime/runtime-ports.ts";
import { isPlatformRun, PLATFORM_ONLY } from "./platform-only.ts";

export const CONVERSATION_PURGE_WORKFLOW_ID = "conversation-purge";
/** Platform schedule (SP5 spec §3.2): daily at 04:30 UTC. */
export const CONVERSATION_PURGE_CRON = "30 4 * * *";

export const ConversationPurgeResultSchema = z.strictObject({
  status: z.enum(["done", "failed"]),
  purged: z.int().min(0),
  failed: z.int().min(0),
  code: z.string().nullable(),
});

export type ConversationPurgeDeps = {
  readonly conversationPurge: ConversationPurgePort;
  /** Tenant memory (thread id = conversation id); without it the storage's memory domain is used. */
  readonly memory?: Pick<Memory, "deleteThread"> | undefined;
};

/**
 * `conversation-purge` (SP5 spec §3.2): hard-deletes conversations soft-deleted more than 30 days
 * ago, the Mastra thread (messages and recall vectors, through `Memory`) before the Firestore
 * metadata, so a failure is retried by the next daily run. Platform only.
 */
export const createConversationPurgeWorkflow = (deps: ConversationPurgeDeps) =>
  createWorkflow({
    id: CONVERSATION_PURGE_WORKFLOW_ID,
    description: "Purges conversations deleted more than 30 days ago.",
    inputSchema: z.strictObject({}),
    outputSchema: ConversationPurgeResultSchema,
  })
    .then(
      createStep({
        id: "purge",
        inputSchema: z.strictObject({}),
        outputSchema: ConversationPurgeResultSchema,
        execute: async ({ requestContext, mastra }) => {
          if (!isPlatformRun(requestContext))
            return { status: "failed" as const, purged: 0, failed: 0, code: PLATFORM_ONLY };
          const deleteThread = async (threadId: string): Promise<boolean> => {
            try {
              if (deps.memory !== undefined) await deps.memory.deleteThread(threadId);
              else await (await mastra.getStorage()?.getStore("memory"))?.deleteThread({ threadId });
              return true;
            } catch (error: unknown) {
              mastra.getLogger().error("conversation_thread_purge_failed", { threadId, err: error });
              return false;
            }
          };
          const result = await deps.conversationPurge.purgeDeleted({ deleteThread });
          return { status: "done" as const, ...result, code: null };
        },
      }),
    )
    .commit();
