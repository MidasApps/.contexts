import type { MastraVector } from "@mastra/core/vector";
import type { MastraCompositeStore } from "@mastra/core/storage";
import { Memory } from "@mastra/memory";
import type { AgentModels } from "../models/model-factory.ts";
import type { AgentEnvInput } from "../runtime/agent-env.schema.ts";
import { toEmbeddingModelV3 } from "./embedding-model-v3.ts";
import { WorkingMemorySchema } from "./working-memory.schema.ts";

/**
 * Agent memory (SP3 spec §10, decision 0029): message history, semantic recall
 * and working memory, all scoped to the resource `tenantId:uid` that the context
 * middleware sets as `MASTRA_RESOURCE_ID_KEY` (a client never names it), with the
 * thread = conversation id (`MASTRA_THREAD_ID_KEY`). Mastra refuses a thread that
 * belongs to another resource with 403.
 *
 * Vectors live in Mastra's `PgVector` (schema `mastra`, index `memory_messages`,
 * 1536 dimensions like the knowledge base). The runtime role has no DDL: outside
 * `local` the index is created by `pnpm -F @core/mastra db:init`.
 */

/** Messages of the thread sent with every call (bounded, stacks/ai/mastra-sdk.md). */
export const MEMORY_LAST_MESSAGES = 20;
/** Recalled messages from the user's other threads in the same organization. */
export const MEMORY_RECALL_TOP_K = 4;
export const MEMORY_RECALL_MESSAGE_RANGE = 1;
/** Mastra's name for the 1536-dimension message index (`Memory.getEmbeddingIndexName`). */
export const MEMORY_VECTOR_INDEX = "memory_messages";
export const MEMORY_VECTOR_DIMENSIONS = 1536;

export type CreateMemoryArgs = {
  /** The Mastra storage (threads, messages, working memory in schema `mastra`). */
  readonly storage: MastraCompositeStore;
  /** `PgVector` on schema `mastra` in the app; any `MastraVector` in tests. */
  readonly vector: MastraVector;
  readonly models: Pick<AgentModels, "language" | "embedding">;
  readonly env: Pick<AgentEnvInput, "AI_MEMORY_OBSERVATIONAL">;
};

// Observational Memory stays off until its comparative eval (Task 28); when enabled, its
// model is the fast role explicitly (Mastra would otherwise pick a Gemini default).
const observationalMemoryOf = (args: CreateMemoryArgs) =>
  args.env.AI_MEMORY_OBSERVATIONAL ? { enabled: true, model: args.models.language("fast", { agentId: "memory" }), scope: "resource" as const } : false;

/** The memory the supervisor (Task 20) and chat agents share; one instance per runtime. */
export const createMemory = (args: CreateMemoryArgs): Memory =>
  new Memory({
    storage: args.storage,
    vector: args.vector,
    embedder: toEmbeddingModelV3(args.models.embedding()),
    options: {
      lastMessages: MEMORY_LAST_MESSAGES,
      semanticRecall: { topK: MEMORY_RECALL_TOP_K, messageRange: MEMORY_RECALL_MESSAGE_RANGE, scope: "resource" },
      workingMemory: { enabled: true, scope: "resource", schema: WorkingMemorySchema },
      generateTitle: { model: args.models.language("fast", { agentId: "memory" }) },
      observationalMemory: observationalMemoryOf(args),
    },
  });
