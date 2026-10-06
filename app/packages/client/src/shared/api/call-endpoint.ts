import type { EndpointDefinition, InferEndpointResponse } from "@core/contracts";
import { ulid } from "ulid";
import type { z } from "zod";
import { ApiError } from "./api-error.ts";
import type { HttpClient } from "./http-client.ts";

type InputOf<Schema> = Schema extends z.ZodType ? z.input<Schema> : never;

/** Declared parts are required (params, body); the query is optional as a whole. */
type PartsOf<E extends EndpointDefinition> = (E["params"] extends z.ZodType
  ? { params: InputOf<E["params"]> }
  : { params?: never }) &
  (E["query"] extends z.ZodType ? { query?: InputOf<E["query"]> } : { query?: never }) &
  (E["body"] extends z.ZodType ? { body: InputOf<E["body"]> } : { body?: never });

export type EndpointCallOptions<E extends EndpointDefinition> = PartsOf<E> & {
  /** Reuse the same key when retrying one logical operation (contracts/api.md §11.1). */
  idempotencyKey?: string;
  signal?: AbortSignal;
};

export type CallEndpoint = <const E extends EndpointDefinition>(
  endpoint: E,
  options: EndpointCallOptions<E>,
) => Promise<InferEndpointResponse<E>>;

const PARAM = /\{([a-zA-Z][A-Za-z0-9]*)\}/gu;

/** Path and query values are scalars; anything else is a caller bug. */
const toText = (value: unknown, name: string): string => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  throw new RangeError(`Unsupported value for "${name}"`);
};

const fillPath = (path: string, params: Record<string, unknown> | undefined): string =>
  path.replace(PARAM, (_segment, name: string) => {
    const value = params?.[name];
    if (value === undefined || value === null || value === "") throw new RangeError(`Missing path param {${name}}`);
    return encodeURIComponent(toText(value, name));
  });

/** `?a=1&list=x,y` (contracts/api.md §9–10: lists by comma); undefined and null are left out. */
const serializeQuery = (query: Record<string, unknown> | undefined): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null) continue;
    search.set(key, Array.isArray(value) ? value.map((item) => toText(item, key)).join(",") : toText(value, key));
  }
  const text = search.toString();
  return text === "" ? "" : `?${text}`;
};

const invalidResponse = (status: number, requestId: string | undefined, cause?: unknown): ApiError =>
  new ApiError(
    { status, code: "INVALID_RESPONSE", message: "Response does not match the endpoint contract.", requestId },
    { cause },
  );

/** Parses a success body with the schema the descriptor declares for that status. */
const parseResponse = (
  endpoint: EndpointDefinition,
  status: number,
  body: unknown,
  requestId: string | undefined,
): unknown => {
  const responses = endpoint.responses as Record<number, z.ZodType | null | undefined>;
  if (!(status in responses)) throw invalidResponse(status, requestId);
  const schema = responses[status];
  if (schema === null || schema === undefined) return undefined;
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw invalidResponse(status, requestId, parsed.error);
  return parsed.data;
};

/**
 * `callEndpoint(endpoint, { params, query, body, idempotencyKey })` typed by SP1's endpoint
 * descriptors: builds the path (params URI-encoded) and query, sends through the HTTP client and
 * parses the answer with the descriptor's schema (a mismatch is `INVALID_RESPONSE`, never data).
 * A missing key on an `idempotency: "required"` endpoint is generated per call.
 * @example
 *   const callEndpoint = createEndpointCaller(http);
 *   const { data } = await callEndpoint(getOrganizationEndpoint, { params: { organizationId } });
 */
export const createEndpointCaller =
  (http: HttpClient): CallEndpoint =>
  async (endpoint, options) => {
    const parts = options as { params?: Record<string, unknown>; query?: Record<string, unknown>; body?: unknown };
    const idempotencyKey = options.idempotencyKey ?? (endpoint.idempotency === "required" ? ulid() : undefined);
    const response = await http.request({
      method: endpoint.method,
      path: `${fillPath(endpoint.path, parts.params)}${serializeQuery(parts.query)}`,
      body: parts.body,
      idempotencyKey,
      auth: endpoint.auth,
      signal: options.signal,
    });
    return parseResponse(endpoint, response.status, response.body, response.requestId) as InferEndpointResponse<
      typeof endpoint
    >;
  };
