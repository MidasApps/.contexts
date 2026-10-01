import { ErrorEnvelopeSchema } from "@core/contracts";
import { DefaultChatTransport, type ChatTransport, type UIMessage } from "ai";
import { ulid } from "ulid";
import { ApiError } from "./api-error.ts";
import type { FetchLike, GetIdToken } from "./http-client.ts";

/** Where a new conversation starts (SP4 spec §4.1); an existing one keeps its own scope. */
export type ChatScope = { readonly organizationId: string; readonly projectId?: string | undefined; readonly agentId?: string | undefined };

export type ChatTransportOptions = {
  /** API origin; `""` on web (same origin), `VITE_API_URL` on desktop. */
  readonly baseUrl: string;
  /** Firebase ID token of the signed-in user, asked again for every request. */
  readonly getIdToken: GetIdToken;
  readonly fetch: FetchLike;
  /** Read at send time, so moving to another project does not rebuild the transport. */
  readonly getScope: () => ChatScope;
  /** The conversation of this chat; `undefined` until the first answer names it. */
  readonly getConversationId: () => string | undefined;
  /** Called with the `x-conversation-id` of every chat response. */
  readonly onConversationId: (conversationId: string) => void;
  /** Request id factory (default ULID, contracts/api.md §11.1). */
  readonly newRequestId?: (() => string) | undefined;
};

type LoosePart = { readonly type: string; readonly [key: string]: unknown };
type ChatRequestMessage = { id: string; role: "user" | "assistant"; parts: Record<string, unknown>[] };

const CONVERSATION_HEADER = "x-conversation-id";

const isText = (part: LoosePart): boolean => part.type === "text" && typeof part["text"] === "string" && part["text"].trim() !== "";
const isAnsweredApproval = (part: LoosePart): boolean => part["state"] === "approval-responded" && typeof part["approval"] === "object" && part["approval"] !== null;

/** The fields `ToolApprovalResponsePartSchema` accepts, nothing else (it is strict). */
const toApprovalPart = (part: LoosePart): Record<string, unknown> => {
  const approval = part["approval"] as { id?: unknown; approved?: unknown; reason?: unknown };
  const reason = typeof approval.reason === "string" ? approval.reason.trim() : "";
  return {
    type: part.type,
    toolCallId: part["toolCallId"],
    ...(part.type === "dynamic-tool" && typeof part["toolName"] === "string" ? { toolName: part["toolName"] } : {}),
    state: "approval-responded",
    approval: { id: approval.id, approved: approval.approved === true, ...(reason === "" ? {} : { reason }) },
  };
};

const toUserMessage = (message: UIMessage): ChatRequestMessage => ({
  id: message.id,
  role: "user",
  parts: (message.parts as LoosePart[]).filter(isText).map((part) => ({ type: "text", text: part["text"] })),
});

/**
 * The one message `/v1/chat` accepts (`ChatRequestSchema`): memory holds the history. An
 * assistant message travels only to carry approval responses; otherwise the last user message.
 */
const lastMessageOf = (messages: readonly UIMessage[]): ChatRequestMessage | undefined => {
  const last = messages.at(-1);
  if (last?.role === "assistant") {
    const approvals = (last.parts as LoosePart[]).filter(isAnsweredApproval).map(toApprovalPart);
    if (approvals.length > 0) return { id: last.id, role: "assistant", parts: approvals };
  }
  const user = messages.findLast((message) => message.role === "user");
  return user === undefined ? undefined : toUserMessage(user);
};

const fileIdsOf = (attachments: unknown): string[] | undefined => {
  if (!Array.isArray(attachments) || attachments.length === 0) return undefined;
  const ids = attachments.flatMap((entry: unknown): string[] => {
    if (typeof entry === "string") return [entry];
    const fileId = typeof entry === "object" && entry !== null ? (entry as { fileId?: unknown }).fileId : undefined;
    return typeof fileId === "string" ? [fileId] : [];
  });
  return ids.length === 0 ? undefined : ids;
};

/**
 * File ids of the turn: from the send options, or from the message's own metadata when the turn
 * is sent again (retry, regenerate), so its attachments are not lost.
 */
const attachmentsOf = (body: Record<string, unknown> | undefined, messages: readonly UIMessage[], messageId: string): string[] | undefined => {
  const metadata = messages.find((message) => message.id === messageId)?.metadata as { attachments?: unknown } | undefined;
  return fileIdsOf(body?.["attachments"]) ?? fileIdsOf(metadata?.attachments);
};

const toApiError = async (response: Response, requestId: string): Promise<ApiError> => {
  const body: unknown = await response.json().catch(() => undefined);
  const envelope = ErrorEnvelopeSchema.safeParse(body);
  if (envelope.success) {
    const { code, message, details, requestId: bodyRequestId } = envelope.data.error;
    return new ApiError({ status: response.status, code, message, details, requestId: bodyRequestId });
  }
  return new ApiError({ status: response.status, code: "INVALID_RESPONSE", message: "Unexpected error response.", requestId });
};

const urlOf = (input: RequestInfo | URL): string => {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
};

/**
 * `fetch` for the chat routes: Bearer token asked per request, a ULID `x-request-id`, the
 * conversation id read from the response, and failures as `ApiError` (so the chat error state
 * shows `errors.<code>` and the request reference). A 401 is retried once after a forced token
 * refresh: the API rejected the call before doing anything.
 */
const createChatFetch = (options: ChatTransportOptions) => {
  const newRequestId = options.newRequestId ?? ulid;
  const attempt = async (url: string, init: RequestInit, forceRefresh: boolean): Promise<{ response: Response; requestId: string }> => {
    const requestId = newRequestId();
    const token = await options.getIdToken({ forceRefresh });
    const headers = new Headers(init.headers);
    headers.set("x-request-id", requestId);
    if (token !== null) headers.set("authorization", `Bearer ${token}`);
    try {
      return { response: await options.fetch(url, { ...init, headers, credentials: "omit" }), requestId };
    } catch (error: unknown) {
      if (init.signal?.aborted === true) throw error;
      throw new ApiError({ status: 0, code: "NETWORK_ERROR", message: "Network request failed.", requestId }, { cause: error });
    }
  };
  return async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = urlOf(input);
    let { response, requestId } = await attempt(url, init, false);
    if (response.status === 401) ({ response, requestId } = await attempt(url, init, true));
    if (!response.ok) throw await toApiError(response, requestId);
    const conversationId = response.headers.get(CONVERSATION_HEADER);
    if (conversationId !== null && conversationId !== "") options.onConversationId(conversationId);
    return response;
  };
};

type TransportInit = NonNullable<ConstructorParameters<typeof DefaultChatTransport<UIMessage>>[0]>;

class CoreChatTransport extends DefaultChatTransport<UIMessage> {
  readonly #getConversationId: () => string | undefined;
  constructor(init: TransportInit, getConversationId: () => string | undefined) {
    super(init);
    this.#getConversationId = getConversationId;
  }

  /** Nothing to resume before the first answer: no request is made. */
  override reconnectToStream(options: Parameters<ChatTransport<UIMessage>["reconnectToStream"]>[0]) {
    if (this.#getConversationId() === undefined) return Promise.resolve(null);
    return super.reconnectToStream(options);
  }
}

/**
 * `useChat` transport for `/v1/chat` (SP4 spec §3, decision 0031): sends only the last message
 * (`organizationId` to start a conversation, `conversationId` afterwards), approval responses in
 * the exact contract shape, attachments by file id (`sendMessage(…, { body: { attachments } })`),
 * and resumes through `GET /v1/chat/{id}/stream` (204 → nothing to resume).
 */
export const createChatTransport = (options: ChatTransportOptions): ChatTransport<UIMessage> => {
  const api = `${options.baseUrl}/v1/chat`;
  return new CoreChatTransport(
    {
      api,
      fetch: createChatFetch(options),
      prepareSendMessagesRequest: ({ messages, trigger, body }) => {
        const message = lastMessageOf(messages);
        if (message === undefined) throw new ApiError({ status: 0, code: "VALIDATION_FAILED", message: "No message to send." });
        const conversationId = options.getConversationId();
        const scope = options.getScope();
        const start = {
          organizationId: scope.organizationId,
          ...(scope.projectId === undefined ? {} : { projectId: scope.projectId }),
          ...(scope.agentId === undefined ? {} : { agentId: scope.agentId }),
        };
        const attachments = message.role === "user" ? attachmentsOf(body, messages, message.id) : undefined;
        return { body: { ...(conversationId === undefined ? start : { conversationId }), message, trigger, ...(attachments === undefined ? {} : { attachments }) } };
      },
      prepareReconnectToStreamRequest: () => ({ api: `${api}/${encodeURIComponent(options.getConversationId() ?? "")}/stream` }),
    },
    options.getConversationId,
  );
};
