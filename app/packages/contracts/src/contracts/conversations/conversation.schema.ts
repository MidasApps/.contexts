import { z } from "zod";
import { CustomAgentIdSchema } from "../agents/custom-agent.schema.ts";
import { defineContract } from "../contract.ts";
import { EXAMPLE_IDS, EXAMPLE_TIMES } from "../example-values.ts";
import { none, personal } from "../field-docs.ts";
import { TenantIdSchema, UserIdSchema } from "../primitives/ids.schema.ts";
import { IsoDateTimeSchema } from "../primitives/iso-datetime.schema.ts";
import { ProjectIdSchema } from "../tenancy/ids.schema.ts";

/**
 * Conversation id: a Firestore automatic id that is also the Mastra memory thread id
 * (decision 0033), so only the thread-id alphabet is accepted (no separators or dots).
 */
export const ConversationIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,128}$/, { error: "Expected a conversation id." })
  .brand<"ConversationId">();
export type ConversationId = z.infer<typeof ConversationIdSchema>;

/**
 * Public chat agent ids (`/chat/:agentId` on Mastra): the supervisor, or the id of an enabled
 * custom agent of the organization (decision 0046; `/v1/chat` checks it exists).
 */
export const ChatAgentIdSchema = z.union([z.literal("assistant"), CustomAgentIdSchema]);
export type ChatAgentId = z.infer<typeof ChatAgentIdSchema>;

export const MAX_TITLE_CHARS = 200;
export const MAX_SUMMARY_CHARS = 2000;
export const MAX_SEARCH_TOKENS = 50;

const nullableTime = (description: string) => IsoDateTimeSchema.nullable().meta(none(description));

/**
 * Metadata of one chat conversation (Firestore `conversations/{id}`, SP4 spec §4.1,
 * decision 0033). Messages live only in Mastra memory. Owner-only in v1.
 */
export const ConversationSchema = z.strictObject({
  id: ConversationIdSchema.meta(none("Firestore automatic id; also the memory thread id.")),
  tenantId: TenantIdSchema.meta(none("Owning organization.")),
  projectId: ProjectIdSchema.nullable().meta(none("Project the conversation runs in; null at organization level.")),
  ownerId: UserIdSchema.meta(personal("Uid of the member who owns the conversation.")),
  agentId: ChatAgentIdSchema.meta(none("Chat agent that answers.")),
  title: z
    .string()
    .max(MAX_TITLE_CHARS)
    .nullable()
    .meta(personal("Title; generated after the first turn or set by the owner.")),
  titleSource: z.enum(["auto", "user"]).meta(none("auto until the owner renames it.")),
  summary: z.string().max(MAX_SUMMARY_CHARS).nullable().meta(personal("Summary made on request; may mention people.")),
  pinned: z.boolean().meta(none("Pinned conversations are listed first.")),
  archivedAt: nullableTime("When the owner archived it; null when active."),
  deletedAt: nullableTime("Soft delete; purged 30 days later."),
  lastMessageAt: IsoDateTimeSchema.meta(none("When the last turn ended (UTC).")),
  messageCount: z.int().nonnegative().meta(none("Turns sent and answered (approximate).")),
  activeRunId: z.string().min(1).max(128).nullable().meta(none("Agent run streaming now; null when idle.")),
  activeStreamStartedAt: nullableTime("When the active run started; stale after 15 minutes."),
  searchTokens: z
    .array(z.string().min(1).max(64))
    .max(MAX_SEARCH_TOKENS)
    .meta(personal("Lower-case, accent-folded words of the title and summary, for search.")),
  createdAt: IsoDateTimeSchema.meta(none("When the conversation started (UTC).")),
  updatedAt: IsoDateTimeSchema.meta(none("When the metadata last changed (UTC).")),
});
export type Conversation = z.infer<typeof ConversationSchema>;

export const EXAMPLE_CONVERSATION_ID = "Cv3xZ5aB7nM9qW1eR2tY";

export const ConversationContract = defineContract(ConversationSchema, {
  id: "conversations.Conversation",
  kind: "entity",
  description:
    "A chat conversation of a member: title, summary, pin and archive state; the messages live in agent memory.",
  examples: [
    {
      id: EXAMPLE_CONVERSATION_ID,
      tenantId: EXAMPLE_IDS.organization,
      projectId: null,
      ownerId: EXAMPLE_IDS.user,
      agentId: "assistant",
      title: "Quarterly onboarding plan",
      titleSource: "auto",
      summary: null,
      pinned: false,
      archivedAt: null,
      deletedAt: null,
      lastMessageAt: EXAMPLE_TIMES.updated,
      messageCount: 4,
      activeRunId: null,
      activeStreamStartedAt: null,
      searchTokens: ["quarterly", "onboarding", "plan"],
      createdAt: EXAMPLE_TIMES.created,
      updatedAt: EXAMPLE_TIMES.updated,
    },
  ],
  pii: "personal",
  tenancyScope: "user",
  relations: [{ target: "tenancy.Organization", type: "belongs-to", field: "tenantId" }],
  permission: "core.conversation.read",
});
