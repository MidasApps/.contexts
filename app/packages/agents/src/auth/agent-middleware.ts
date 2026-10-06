import type { RequestContextStore } from "../context/write-agent-context.ts";
import { DEFAULT_MASTRA_API_PREFIX } from "./firebase-mastra-auth.ts";

/**
 * The part of Hono's `Context` the core middleware uses. Mastra's
 * `server.middleware` hands a full Hono context, which satisfies this; tests
 * pass a plain object.
 */
export type AgentMiddlewareContext = {
  /** `raw` is replaced by the context middleware (server-owned tracing options). */
  readonly req: { raw: Request };
  readonly get: (key: "requestContext") => RequestContextStore;
  /** Sets a response header (Hono `c.header`); set before `next()` so streamed answers carry it too. */
  readonly header?: (name: string, value: string) => void;
};

export type AgentMiddlewareHandler = (
  context: AgentMiddlewareContext,
  next: () => Promise<void>,
) => Promise<Response | void>;

/** A Mastra `server.middleware` entry (`{ path, handler }`). */
export type AgentMiddleware = { readonly path: string; readonly handler: AgentMiddlewareHandler };

/** Normalized API prefix without a trailing slash (`/api`). */
export const normalizeApiPrefix = (apiPrefix: string = DEFAULT_MASTRA_API_PREFIX): string =>
  apiPrefix.replace(/\/+$/, "") || DEFAULT_MASTRA_API_PREFIX;

/** Mastra registers middleware paths unchanged, so they must carry the prefix. */
export const apiPathPattern = (apiPrefix?: string): string => `${normalizeApiPrefix(apiPrefix)}/*`;
