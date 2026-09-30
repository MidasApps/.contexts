import { FORWARDED_HEADERS } from "@core/contracts";

/**
 * W3C trace context of a run (spec §13): Mastra does not read `traceparent`
 * itself, so the context middleware turns the header `/v1` forwards into the
 * run's `tracingOptions` (`traceId` / `parentSpanId`), and any
 * `tracingOptions` a caller put in the body is dropped. Caller-set tracing
 * options could otherwise rename spans or override span metadata keys such as
 * `tenantId` (observed with `@mastra/observability` 1.18.1: explicit metadata
 * wins over request-context keys).
 */

export type TraceContext = { readonly traceId: string; readonly parentSpanId: string };

const TRACEPARENT_PATTERN = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})(-.*)?$/;
const ALL_ZEROS = /^0+$/;
const BODY_METHODS: ReadonlySet<string> = new Set(["POST", "PUT", "PATCH"]);

/**
 * Parses a `traceparent` header (W3C Trace Context level 1).
 * @returns `null` for a missing or invalid header: version `ff`, all-zero ids,
 * uppercase hex, or extra fields on version `00`.
 */
export const parseTraceparent = (header: string | null | undefined): TraceContext | null => {
  const match = TRACEPARENT_PATTERN.exec(header?.trim() ?? "");
  if (match === null) return null;
  const [, version, traceId, parentSpanId, , extra] = match;
  if (version === undefined || traceId === undefined || parentSpanId === undefined) return null;
  if (version === "ff" || (version === "00" && extra !== undefined)) return null;
  if (ALL_ZEROS.test(traceId) || ALL_ZEROS.test(parentSpanId)) return null;
  return { traceId, parentSpanId };
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

const readJsonObject = async (request: Request): Promise<Record<string, unknown> | null> => {
  if (!BODY_METHODS.has(request.method) || !(request.headers.get("content-type") ?? "").includes("application/json")) return null;
  try {
    const body: unknown = JSON.parse(await request.clone().text());
    return isPlainObject(body) ? body : null;
  } catch {
    return null;
  }
};

/**
 * The request with server-owned tracing options: a JSON body loses any
 * client `tracingOptions` and gains `{ traceId, parentSpanId }` from a valid
 * `traceparent`. Any other request is returned as is.
 */
export const withServerTracingOptions = async (request: Request): Promise<Request> => {
  const body = await readJsonObject(request);
  if (body === null) return request;
  const trace = parseTraceparent(request.headers.get(FORWARDED_HEADERS.traceparent));
  if (!("tracingOptions" in body) && trace === null) return request;
  const rest = Object.fromEntries(Object.entries(body).filter(([key]) => key !== "tracingOptions"));
  const next = trace === null ? rest : { ...rest, tracingOptions: { traceId: trace.traceId, parentSpanId: trace.parentSpanId } };
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  return new Request(request, { body: JSON.stringify(next), headers });
};
