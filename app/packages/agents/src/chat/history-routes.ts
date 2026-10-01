import { toAISdkMessages } from "@mastra/ai-sdk/ui";
import type { Agent } from "@mastra/core/agent";
import type { Mastra } from "@mastra/core/mastra";
import type { RequestContext } from "@mastra/core/request-context";
import { safeValidateUIMessages, type UIMessage } from "ai";
import { withAnswerConfidence } from "./answer-confidence.ts";
import { callerOf, chatError, type ChatRouteDeps } from "./chat-http.ts";

/** `GET /chat/:agentId/messages?page&perPage` and `POST /chat/:agentId/summary` (SP4 Task 6). */
export const MESSAGES_ROUTE_PATH = "/chat/:agentId/messages";
export const SUMMARY_ROUTE_PATH = "/chat/:agentId/summary";
export const MAX_MESSAGES_PER_PAGE = 100;
/** Spec §4.1: the summary reads at most the last 100 messages. */
export const SUMMARY_MESSAGE_WINDOW = 100;
const MAX_TRANSCRIPT_CHARS = 60_000;
const MAX_SUMMARY_CHARS = 2000;

export type HistoryInput = { readonly agentId: string; readonly requestContext: RequestContext<unknown>; readonly mastra: Mastra; readonly url: URL };

const pageParam = (url: URL, name: string, fallback: number, max: number): number | null => {
  const raw = url.searchParams.get(name);
  if (raw === null) return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 && value <= max ? value : null;
};

// The caller's own thread (the middleware refused a foreign one), newest messages first.
const readWindow = async (input: HistoryInput, page: number, perPage: number) => {
  const { resourceId, threadId } = callerOf(input.requestContext);
  if (resourceId === undefined || threadId === undefined) return null;
  const memory = await input.mastra.getStorage()?.getStore("memory");
  if (memory === undefined) return null;
  const listed = await memory.listMessages({ threadId, resourceId, page, perPage, orderBy: { field: "createdAt", direction: "DESC" }, includeTotal: false });
  // Chronological inside the page, as `useChat` renders them.
  return { messages: [...listed.messages].reverse(), hasMore: listed.hasMore };
};

const toUiMessages = async (stored: Parameters<typeof toAISdkMessages>[0]): Promise<UIMessage[]> => {
  const converted = toAISdkMessages(stored, { version: "v7" }) as unknown as UIMessage[];
  if (converted.length === 0) return [];
  const validated = await safeValidateUIMessages({ messages: converted });
  // Confidence is derived from the answer's knowledge delegations, exactly as the live stream does.
  return validated.success ? withAnswerConfidence(validated.data) : [];
};

/**
 * Stored messages of the caller's conversation as AI SDK v7 UI messages (spec §4.1): page 0 is
 * the newest page. Messages that fail `validateUIMessages` make the page empty rather than reach
 * the client malformed.
 */
export const handleMessages = async (input: HistoryInput, deps: Pick<ChatRouteDeps, "chatAgents" | "logger">): Promise<Response> => {
  if (deps.chatAgents[input.agentId] === undefined) return chatError("NOT_FOUND", input.requestContext);
  const page = pageParam(input.url, "page", 0, 100_000);
  const perPage = pageParam(input.url, "perPage", 50, MAX_MESSAGES_PER_PAGE);
  if (page === null || perPage === null || perPage === 0) return chatError("VALIDATION_FAILED", input.requestContext, [{ field: "page", issue: "INVALID" }]);
  const window = await readWindow(input, page, perPage);
  if (window === null) return chatError("FORBIDDEN", input.requestContext);
  return Response.json({ data: await toUiMessages(window.messages), meta: { hasMore: window.hasMore } });
};

const transcriptOf = (messages: readonly UIMessage[]): string =>
  messages
    .map((message) => {
      const text = message.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join(" ");
      return text === "" ? "" : `${message.role}: ${text}`;
    })
    .filter((line) => line !== "")
    .join("\n")
    .slice(-MAX_TRANSCRIPT_CHARS);

/**
 * Summary of the last 100 messages with the `fast` role (spec §4.1). The summarizer is a plain
 * agent without tools or memory, guarded by the tenant budget, so the call is traced, billed in
 * the usage ledger and capped like any other model call. 409 when there is nothing to summarize.
 */
export const handleSummary = async (input: HistoryInput, deps: Pick<ChatRouteDeps, "chatAgents" | "logger"> & { readonly summarizer: Agent }): Promise<Response> => {
  if (deps.chatAgents[input.agentId] === undefined) return chatError("NOT_FOUND", input.requestContext);
  const window = await readWindow(input, 0, SUMMARY_MESSAGE_WINDOW);
  if (window === null) return chatError("FORBIDDEN", input.requestContext);
  const transcript = transcriptOf(await toUiMessages(window.messages));
  if (transcript === "") return chatError("CONFLICT", input.requestContext);
  const result = await deps.summarizer.generate(transcript, { requestContext: input.requestContext });
  const summary = result.text.trim().slice(0, MAX_SUMMARY_CHARS);
  if (summary === "") return chatError("CONFLICT", input.requestContext);
  deps.logger.info("conversation_summarized", { requestId: input.requestContext.get("requestId"), messageCount: window.messages.length });
  return Response.json({ data: { summary } });
};
