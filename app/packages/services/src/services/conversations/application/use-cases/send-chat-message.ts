import type { ChatAgentId, ChatRequest, Conversation, CustomAgentId, NodeRef, ProjectId, TenantId, UserPrincipal } from "@core/contracts";
import type { Authorize } from "../../../access/application/ports/driving/authorize.ts";
import type { DenyReason } from "../../../access/domain/authorization.ts";
import type { AgentCallScope, GatewayError } from "../../../agents/application/ports/agent-runtime-gateway.ts";
import type { ChatRuntimeGateway, ChatStreamAnswer } from "../../../agents/application/ports/chat-runtime-gateway.ts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import type { ConversationsServices } from "../../composition.ts";
import type { AttachmentIssue, ResolveAttachments } from "./resolve-attachments.ts";
import { decisionOf, type RecordToolDecisions } from "./record-tool-decision.ts";

export const CONVERSATION_SEND_PERMISSION = "core.conversation.send";

export type SendChatError =
  | { readonly code: "CONVERSATION_NOT_FOUND" }
  | { readonly code: "AGENT_NOT_FOUND" }
  | { readonly code: "ACCESS_DENIED"; readonly reason: DenyReason }
  | { readonly code: "STREAMS_EXHAUSTED" }
  | { readonly code: "ATTACHMENTS_INVALID"; readonly details: readonly AttachmentIssue[] }
  | { readonly code: "APPROVAL_INVALID" }
  | { readonly code: "SCOPE_UNAVAILABLE" }
  | { readonly code: "GATEWAY"; readonly error: GatewayError };

export type SentChat = { readonly conversation: Conversation; readonly stream: ChatStreamAnswer; readonly runId: string; readonly scope: AgentCallScope };

export type SendChatDeps = {
  readonly conversations: ConversationsServices;
  readonly gateway: ChatRuntimeGateway;
  readonly resolveAttachments: ResolveAttachments;
  readonly recordToolDecisions: RecordToolDecisions;
  /**
   * Whether a custom agent is enabled in the tenant (decision 0046). Without it only the
   * assistant answers: a custom agent id is refused (fail closed).
   */
  readonly isChatAgentEnabled?: (input: { readonly tenantId: TenantId; readonly agentId: CustomAgentId }) => Promise<boolean>;
};

export type SendChatMessage = (input: {
  readonly principal: UserPrincipal;
  readonly request: ChatRequest;
  readonly requestId: string;
  readonly authorize: Authorize;
  /** The `/v1` scope of the gateway call for a conversation (`null`: no access context or Bearer). */
  readonly scopeOf: (conversation: Conversation) => Promise<AgentCallScope | null>;
}) => Promise<Result<SentChat, SendChatError>>;

/** Node of a conversation: its project, else the organization. */
export const conversationNode = (target: { readonly tenantId: TenantId; readonly projectId: ProjectId | null }): NodeRef =>
  target.projectId === null ? { level: "organization", tenantId: target.tenantId } : { level: "project", tenantId: target.tenantId, projectId: target.projectId };

type Target = { readonly tenantId: TenantId; readonly projectId: ProjectId | null; readonly existing: Conversation | null };

// The conversation named by the request (owner only), or the tenant and project of a new one.
const targetOf = async (deps: SendChatDeps, input: Parameters<SendChatMessage>[0]): Promise<Target | null> => {
  const { request, principal } = input;
  if (request.conversationId === undefined) {
    return request.organizationId === undefined ? null : { tenantId: request.organizationId, projectId: request.projectId ?? null, existing: null };
  }
  const found = await deps.conversations.getConversation({ conversationId: request.conversationId, ownerId: principal.uid });
  if (!found.ok || (request.organizationId !== undefined && request.organizationId !== found.data.tenantId)) return null;
  return { tenantId: found.data.tenantId, projectId: found.data.projectId, existing: found.data };
};

type Prepared = { readonly message: unknown; readonly audit?: () => Promise<void> };

// A user turn gets its attachments; an approval response is reduced to its decisions (audited first).
const prepareMessage = async (
  deps: SendChatDeps,
  input: Parameters<SendChatMessage>[0],
  target: { readonly tenantId: TenantId; readonly conversationId: string },
): Promise<Result<Prepared, SendChatError>> => {
  const { message } = input.request;
  if (message.role === "user") {
    const fileIds = input.request.attachments ?? [];
    if (fileIds.length === 0) return ok({ message });
    const resolved = await deps.resolveAttachments({ tenantId: target.tenantId, ownerId: input.principal.uid, fileIds });
    if (!resolved.ok) return err({ code: "ATTACHMENTS_INVALID", details: resolved.error.details });
    return ok({ message: { ...message, parts: [...message.parts, ...resolved.data.parts], metadata: { attachments: resolved.data.attachments } } });
  }
  const decisions = message.parts.map((part) => decisionOf(target.conversationId, part));
  if (decisions.some((decision) => decision === null)) return err({ code: "APPROVAL_INVALID" });
  const valid = decisions.filter((decision) => decision !== null);
  const audit = () => deps.recordToolDecisions({ principal: input.principal, tenantId: target.tenantId, requestId: input.requestId, decisions: valid });
  return ok({ message, audit });
};

const checkAccess = async (deps: SendChatDeps, input: Parameters<SendChatMessage>[0], target: Target): Promise<SendChatError | null> => {
  if (input.request.message.role === "assistant" && target.existing === null) return { code: "APPROVAL_INVALID" };
  const decision = await input.authorize({ principal: input.principal, permission: CONVERSATION_SEND_PERMISSION, node: conversationNode(target) });
  if (!decision.allowed) return { code: "ACCESS_DENIED", reason: decision.reason };
  if (input.request.message.role === "user" && !(await deps.conversations.activeRuns.hasStreamCapacity(target.tenantId))) return { code: "STREAMS_EXHAUSTED" };
  return null;
};

// A custom agent must be enabled in the tenant of the conversation on every turn, new or not.
const isAgentAvailable = async (deps: SendChatDeps, input: Parameters<SendChatMessage>[0], target: Target): Promise<boolean> => {
  const agentId: ChatAgentId = target.existing?.agentId ?? input.request.agentId ?? "assistant";
  if (agentId === "assistant") return true;
  return (await deps.isChatAgentEnabled?.({ tenantId: target.tenantId, agentId })) ?? false;
};

/**
 * One `/v1/chat` turn (spec §4.1–§4.4): owner check → authorize `core.conversation.send` →
 * stream cap → attachments (or approval audit) → conversation (created on the first turn) →
 * Mastra chat route → `activeRunId` stored before the stream is returned.
 */
export const makeSendChatMessage =
  (deps: SendChatDeps): SendChatMessage =>
  async (input) => {
    const target = await targetOf(deps, input);
    if (target === null) return err({ code: "CONVERSATION_NOT_FOUND" });
    const denied = await checkAccess(deps, input, target);
    if (denied !== null) return err(denied);
    if (!(await isAgentAvailable(deps, input, target))) return err({ code: "AGENT_NOT_FOUND" });
    // Approval responses exist only for an existing conversation (checkAccess), so a new one needs no id here.
    const prepared = await prepareMessage(deps, input, { tenantId: target.tenantId, conversationId: target.existing?.id ?? "" });
    if (!prepared.ok) return prepared;
    const conversation = target.existing ?? (await startConversation(deps, input, target));
    const scope = await input.scopeOf(conversation);
    if (scope === null) return err({ code: "SCOPE_UNAVAILABLE" });
    await prepared.data.audit?.();
    const body = { messages: [prepared.data.message] as const, ...(input.request.trigger === undefined ? {} : { trigger: input.request.trigger }) };
    const sent = await deps.gateway.send({ scope, agentId: conversation.agentId, body });
    if (!sent.ok) return err({ code: "GATEWAY", error: sent.error });
    if (sent.data.runId === null) {
      await sent.data.body.cancel();
      return err({ code: "GATEWAY", error: { code: "UPSTREAM_UNAVAILABLE", status: 502 } });
    }
    await deps.conversations.activeRuns.start({ conversationId: conversation.id, runId: sent.data.runId });
    return ok({ conversation, stream: sent.data, runId: sent.data.runId, scope });
  };

const startConversation = (deps: SendChatDeps, input: Parameters<SendChatMessage>[0], target: Target): Promise<Conversation> =>
  deps.conversations.startConversation({
    tenantId: target.tenantId,
    projectId: target.projectId,
    ownerId: input.principal.uid,
    agentId: input.request.agentId ?? "assistant",
  });
