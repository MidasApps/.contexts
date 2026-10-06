import { randomInt } from "node:crypto";
import { normalizeApiPrefix } from "./agent-middleware.ts";

/**
 * Conversation ids of agent runs (follow-up #24, decision 0019 amendment). A conversation
 * id is also the memory thread id, so it becomes a storage key: only the Firestore id
 * alphabet is accepted from a header, and new ids look like Firestore automatic ids.
 */

/** Thread ids become storage keys; never accept separators or dots from a header. */
export const CONVERSATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const GENERATED_LENGTH = 20;

/** A fresh conversation id in the shape of a Firestore automatic id (20 chars, about 119 random bits). */
export const newConversationId = (random: (max: number) => number = randomInt): string =>
  Array.from({ length: GENERATED_LENGTH }, () => ALPHABET.charAt(random(ALPHABET.length))).join("");

/**
 * Whether a request starts a run that needs a memory thread: an agent `generate`/`stream`
 * (the supervisor owns the tenant memory, and Mastra fails a memory run without a thread)
 * or a call to an MCP server (its `ask_<agent>` tools run the supervisor), and a chat turn
 * (`POST /chat/:agentId`, outside the prefix, SP4). Tool approval routes resume the run they
 * belong to and never get a new thread.
 */
export const startsConversationRun = (request: Request, apiPrefix?: string): boolean => {
  if (request.method !== "POST") return false;
  const prefix = normalizeApiPrefix(apiPrefix);
  const path = new URL(request.url).pathname;
  if (/^\/chat\/[^/]+$/.test(path)) return true;
  if (!path.startsWith(`${prefix}/`)) return false;
  const rest = path.slice(prefix.length);
  return /^\/agents\/[^/]+\/(?:generate|stream)$/.test(rest) || /^\/mcp\/[^/]+\/mcp$/.test(rest);
};
