import type { AgentCallScope, GatewayResult } from "./agent-runtime-gateway.ts";

/**
 * Driven port of the chat and voice routes of the private agent runtime (SP4 spec §3, §4.2,
 * §4.5; decisions 0031 and 0034). They are Mastra custom routes outside the API prefix; the
 * Mastra adapter is the only implementation. The scope always names the conversation
 * (`X-Conversation-Id`), which Mastra checks against the caller's memory resource.
 */

/** A UI message stream of Mastra, handed to `/v1` unread (bytes pass through unchanged). */
export type ChatStreamAnswer = {
  readonly body: ReadableStream<Uint8Array>;
  readonly contentType: string;
  /** `x-run-id`: the durable run the stream belongs to. */
  readonly runId: string | null;
  /** `x-vercel-ai-ui-message-stream`, passed back to `useChat`. */
  readonly streamProtocol: string | null;
};

/** Body Mastra's `POST /chat/:agentId` accepts: one message and the `useChat` trigger. */
export type ChatTurnBody = {
  readonly messages: readonly [unknown];
  readonly trigger?: "submit-message" | "regenerate-message";
};

/** A page of stored messages, already converted to AI SDK v7 UI messages by Mastra. */
export type ChatMessagesPage = { readonly messages: readonly unknown[]; readonly hasMore: boolean };

export type ChatRuntimeGateway = {
  /** `POST /chat/:agentId`: one turn or an approval response. */
  readonly send: (input: { readonly scope: AgentCallScope; readonly agentId: string; readonly body: ChatTurnBody }) => Promise<GatewayResult<ChatStreamAnswer>>;
  /** `GET /chat/:agentId/runs/:runId/observe`; `null` when Mastra has nothing to replay (204). */
  readonly observe: (input: { readonly scope: AgentCallScope; readonly agentId: string; readonly runId: string }) => Promise<GatewayResult<ChatStreamAnswer | null>>;
  /** `POST /chat/runs/:runId/abort` (always 204 upstream). */
  readonly abort: (input: { readonly scope: AgentCallScope; readonly runId: string }) => Promise<GatewayResult<null>>;
  /** Title Mastra generated for the memory thread (`generateTitle`), or `null`. */
  readonly threadTitle: (input: { readonly scope: AgentCallScope; readonly agentId: string; readonly threadId: string }) => Promise<GatewayResult<string | null>>;
  /** `GET /chat/:agentId/messages`: newest page first, `page` 0-based. */
  readonly listMessages: (input: { readonly scope: AgentCallScope; readonly agentId: string; readonly page: number; readonly perPage: number }) => Promise<GatewayResult<ChatMessagesPage>>;
  /** Deletes the memory thread (the messages) of a conversation; `NOT_FOUND` when it never existed. */
  readonly deleteThread: (input: { readonly scope: AgentCallScope; readonly agentId: string; readonly threadId: string }) => Promise<GatewayResult<null>>;
  /** `POST /chat/:agentId/summary`: summary of the last 100 messages with the `fast` role. */
  readonly summarize: (input: { readonly scope: AgentCallScope; readonly agentId: string }) => Promise<GatewayResult<{ readonly summary: string }>>;
};

/**
 * Voice routes (`/voice/*`). Mastra's 503 (voice off or not configured) maps to
 * `FEATURE_UNAVAILABLE`; its 413, 415 and 422 (audio too large, of another type, too long)
 * map to `VALIDATION_FAILED`.
 */
export type VoiceRuntimeGateway = {
  /** `POST /voice/transcriptions` with the raw audio body. */
  readonly transcribe: (input: { readonly scope: AgentCallScope; readonly audio: Uint8Array<ArrayBuffer>; readonly mediaType: string }) => Promise<GatewayResult<unknown>>;
  /** `POST /voice/speech`: the audio stream and its media type. */
  readonly synthesize: (input: {
    readonly scope: AgentCallScope;
    readonly text: string;
    readonly voice?: string;
  }) => Promise<GatewayResult<{ readonly body: ReadableStream<Uint8Array>; readonly contentType: string }>>;
  /** `POST /voice/realtime-sessions`: an ephemeral realtime secret (503 while the flag is off). */
  readonly createRealtimeSession: (input: { readonly scope: AgentCallScope }) => Promise<GatewayResult<unknown>>;
};
