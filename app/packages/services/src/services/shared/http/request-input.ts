import {
  type EndpointDefinition,
  type IdempotencyKey,
  IdempotencyKeySchema,
  type InferEndpointInput,
} from "@core/contracts";
import type { z } from "zod";
import type { ErrorDetail } from "./error-envelope.ts";
import { matchPathParams } from "./path-params.ts";

export const IDEMPOTENCY_KEY_HEADER = "idempotency-key";

export type RequestInput<E extends EndpointDefinition> =
  | { readonly ok: true; readonly input: InferEndpointInput<E>; readonly idempotencyKey: IdempotencyKey | undefined }
  | { readonly ok: false; readonly details: ErrorDetail[] };

type Part = { value: unknown; details: ErrorDetail[] };

const issuesToDetails = (error: z.ZodError, root: string): ErrorDetail[] =>
  error.issues.map((issue) => ({
    field: issue.path.length === 0 ? root : issue.path.map(String).join("."),
    issue: issue.code.toUpperCase(),
  }));

const parsePart = (schema: z.ZodType | undefined, raw: unknown, root: string): Part => {
  if (schema === undefined) return { value: undefined, details: [] };
  const parsed = schema.safeParse(raw);
  return parsed.success
    ? { value: parsed.data, details: [] }
    : { value: undefined, details: issuesToDetails(parsed.error, root) };
};

// Repeated keys become arrays; a single key stays a string (schemas coerce numbers).
const queryObject = (url: URL): Record<string, string | string[]> => {
  const result: Record<string, string | string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key);
    result[key] = values.length === 1 ? (values[0] ?? "") : values;
  }
  return result;
};

const readBody = async (endpoint: EndpointDefinition, request: Request): Promise<Part> => {
  if (endpoint.body === undefined) return { value: undefined, details: [] };
  const text = await request.text();
  let raw: unknown;
  try {
    raw = text === "" ? undefined : JSON.parse(text);
  } catch {
    // SyntaxError: the body is not JSON; nothing else can throw here.
    return { value: undefined, details: [{ field: "(body)", issue: "INVALID_JSON" }] };
  }
  return parsePart(endpoint.body, raw, "(body)");
};

const readIdempotencyKey = (
  endpoint: EndpointDefinition,
  request: Request,
): { value: IdempotencyKey | undefined; details: ErrorDetail[] } => {
  if (endpoint.idempotency === undefined) return { value: undefined, details: [] };
  const header = request.headers.get(IDEMPOTENCY_KEY_HEADER);
  if (header === null) {
    return {
      value: undefined,
      details: endpoint.idempotency === "required" ? [{ field: "Idempotency-Key", issue: "REQUIRED" }] : [],
    };
  }
  const parsed = IdempotencyKeySchema.safeParse(header);
  return parsed.success
    ? { value: parsed.data, details: [] }
    : { value: undefined, details: [{ field: "Idempotency-Key", issue: "INVALID_FORMAT" }] };
};

/**
 * Parses path params, query, body and `Idempotency-Key` of a request against its endpoint
 * descriptor and reports every issue at once (rules/validation.md). The path is assumed to
 * match (Next routed it here); a mismatch is reported as a `(params)` issue.
 */
export const readRequestInput = async <E extends EndpointDefinition>(
  endpoint: E,
  request: Request,
): Promise<RequestInput<E>> => {
  const url = new URL(request.url);
  const rawParams = matchPathParams(endpoint.path, url.pathname);
  const params: Part =
    rawParams === null
      ? { value: undefined, details: [{ field: "(params)", issue: "PATH_MISMATCH" }] }
      : parsePart(endpoint.params, rawParams, "(params)");
  const query = parsePart(endpoint.query, queryObject(url), "(query)");
  const body = await readBody(endpoint, request);
  const key = readIdempotencyKey(endpoint, request);
  const details = [...params.details, ...query.details, ...body.details, ...key.details];
  if (details.length > 0) return { ok: false, details };
  const input = { params: params.value, query: query.value, body: body.value } as InferEndpointInput<E>;
  return { ok: true, input, idempotencyKey: key.value };
};
