import { FORWARDED_HEADERS } from "@core/contracts";
import type { AgentCallScope, AgentRunOptions, GatewayResult, GatewayStream } from "../../application/ports/agent-runtime-gateway.ts";
import { mapMastraStatus, statusOfClientError, UPSTREAM_TIMEOUT, UPSTREAM_UNAVAILABLE } from "./mastra-error-mapper.ts";
import type { ServerlessIdTokenSource } from "./serverless-id-token.ts";

/** How the gateway reaches Mastra; built once per process. */
export type MastraConnection = {
  readonly baseUrl: string;
  readonly apiPrefix: string;
  readonly fetch: typeof fetch;
  /** Whole-call deadline of JSON calls, and time to first byte of streams. */
  readonly timeouts: { readonly jsonMs: number; readonly streamConnectMs: number };
  /** `null` in local: no Cloud Run IAM in front of Mastra there. */
  readonly serverlessToken: ServerlessIdTokenSource | null;
};

// Keys Mastra must derive itself (context middleware, memory scoping, run id = requestId,
// tracing options from traceparent: caller-set ones could override span metadata).
const SERVER_OWNED_KEYS = new Set(["requestContext", "runId", "resourceId", "threadId", "resource", "thread", "tracingOptions"]);

/** Run options without the keys only the server may set (the client `requestContext` above all). */
export const stripServerOwnedKeys = (options: AgentRunOptions | undefined): Record<string, unknown> =>
  Object.fromEntries(Object.entries(options ?? {}).filter(([key]) => !SERVER_OWNED_KEYS.has(key)));

const optionalHeaders = (scope: AgentCallScope): Record<string, string> => {
  const entries: [string, string | undefined][] = [
    [FORWARDED_HEADERS.projectId, scope.projectId],
    [FORWARDED_HEADERS.unitId, scope.unitId],
    [FORWARDED_HEADERS.activeScreen, scope.activeScreen],
    [FORWARDED_HEADERS.conversationId, scope.conversationId],
    [FORWARDED_HEADERS.traceparent, scope.traceparent],
  ];
  return Object.fromEntries(entries.filter((entry): entry is [string, string] => entry[1] !== undefined));
};

/**
 * Headers of every Mastra call (SP3 spec §4.1), names from `FORWARDED_HEADERS`.
 * @throws {ServerlessIdTokenError} when the Cloud Run ID token cannot be minted.
 */
export const buildForwardedHeaders = async (connection: MastraConnection, scope: AgentCallScope): Promise<Record<string, string>> => ({
  [FORWARDED_HEADERS.authorization]: `Bearer ${scope.bearer}`,
  [FORWARDED_HEADERS.tenantId]: scope.tenantId,
  [FORWARDED_HEADERS.locale]: scope.regional.locale,
  [FORWARDED_HEADERS.displayTimeZone]: scope.regional.displayTimeZone,
  [FORWARDED_HEADERS.nodeTimeZone]: scope.regional.nodeTimeZone,
  [FORWARDED_HEADERS.currency]: scope.regional.currency,
  [FORWARDED_HEADERS.requestId]: scope.requestId,
  ...optionalHeaders(scope),
  ...(connection.serverlessToken === null ? {} : { [FORWARDED_HEADERS.serverlessAuthorization]: await connection.serverlessToken.headerValue() }),
});

/** A non-2xx Mastra answer of a raw call; only its status and Retry-After are kept. */
class UpstreamStatusError extends Error {
  readonly status: number;
  readonly retryAfter: string | null;

  constructor(status: number, retryAfter: string | null) {
    super(`mastra answered ${status}`);
    this.name = "UpstreamStatusError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

class DeadlineExceeded extends Error {
  constructor() {
    super("mastra call deadline exceeded");
    this.name = "DeadlineExceeded";
  }
}

/**
 * Runs one Mastra call under a deadline and maps every failure to a
 * `GatewayError`. The caller's own abort is not an error to map: it rejects
 * with the caller's reason, so `/v1` stops streaming to a client that left.
 */
export const withDeadline = async <T>(scope: AgentCallScope, deadlineMs: number, run: (signal: AbortSignal) => Promise<T>): Promise<GatewayResult<T>> => {
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(new DeadlineExceeded()), deadlineMs);
  const signal = scope.signal === undefined ? deadline.signal : AbortSignal.any([deadline.signal, scope.signal]);
  try {
    return { ok: true, data: await run(signal) };
  } catch (error: unknown) {
    if (scope.signal?.aborted === true) throw scope.signal.reason ?? error;
    if (deadline.signal.aborted) return { ok: false, error: UPSTREAM_TIMEOUT };
    if (error instanceof UpstreamStatusError) return { ok: false, error: mapMastraStatus(error.status, error.retryAfter) };
    const status = statusOfClientError(error);
    return { ok: false, error: status === undefined ? UPSTREAM_UNAVAILABLE : mapMastraStatus(status) };
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Raw POST for streaming routes: the deadline covers the time to the response
 * headers only; the body then streams until it ends or the caller aborts.
 * A non-2xx answer is mapped by status and its body discarded unread.
 */
export const postForStream = (args: {
  connection: MastraConnection;
  scope: AgentCallScope;
  path: string;
  body: unknown;
  accept?: string;
}): Promise<GatewayResult<GatewayStream>> => {
  const { connection, scope } = args;
  return withDeadline(scope, connection.timeouts.streamConnectMs, async (signal) => {
    const headers = { ...(await buildForwardedHeaders(connection, scope)), "content-type": "application/json", ...(args.accept === undefined ? {} : { accept: args.accept }) };
    const response = await connection.fetch(`${connection.baseUrl}${connection.apiPrefix}${args.path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(args.body),
      signal,
    });
    if (!response.ok || response.body === null) {
      await response.body?.cancel();
      throw new UpstreamStatusError(response.ok ? 502 : response.status, response.headers.get("retry-after"));
    }
    const conversationId = response.headers.get(FORWARDED_HEADERS.conversationId);
    return {
      body: response.body,
      contentType: response.headers.get("content-type") ?? "application/octet-stream",
      ...(conversationId === null ? {} : { conversationId }),
    };
  });
};
