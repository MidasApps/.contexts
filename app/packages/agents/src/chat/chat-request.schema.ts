import { z } from "zod";

/**
 * Body of `POST /chat/:agentId` as `/v1/chat` sends it (SP4 spec §4.1, decision 0031): the
 * last message only (memory holds the rest) and the `useChat` trigger. `/v1` validates the
 * parts in detail (`ChatRequest` contract); here only the shape `handleChatStream` needs is
 * checked. `z.object` drops every other key on purpose: run options (`maxSteps`, `memory`,
 * `runId`, `requireToolApproval`, ...) are the server's, never the caller's.
 */
const ChatPartSchema = z.looseObject({ type: z.string().min(1) });

export const ChatMessageSchema = z.looseObject({
  id: z.string().min(1).max(200),
  role: z.enum(["user", "assistant"]),
  parts: z.array(ChatPartSchema).min(1).max(200),
});

export const ChatRouteBodySchema = z.object({
  messages: z.array(ChatMessageSchema).length(1),
  trigger: z.enum(["submit-message", "regenerate-message"]).optional(),
});

export type ChatRouteBody = z.infer<typeof ChatRouteBodySchema>;
