import { errorResponse, type ErrorDetail } from "./error-envelope.ts";

// Short, generic, English (contracts/api.md §6.1); clients localize by `code`.
const MESSAGES: Readonly<Record<string, string>> = {
  UNAUTHORIZED: "Authentication required.",
  FORBIDDEN: "You do not have permission to do this.",
  NOT_FOUND: "Resource not found.",
  VALIDATION_FAILED: "One or more fields are invalid.",
  CONFLICT: "The request conflicts with the current state of the resource.",
  RATE_LIMITED: "Too many requests.",
  INTERNAL_ERROR: "Internal error.",
  IDEMPOTENCY_KEY_REUSED: "This Idempotency-Key was already used with a different request.",
  IDEMPOTENCY_REQUEST_IN_PROGRESS: "A request with this Idempotency-Key is still in progress.",
  MFA_REQUIRED: "Multi-factor authentication is required.",
};
const FALLBACK_MESSAGE = "The request could not be completed.";

/**
 * Canonical error response (contracts/api.md §6) with a generic message per code.
 * @example return apiError(404, "NOT_FOUND", requestId);
 */
export const apiError = (status: number, code: string, requestId: string, details?: ErrorDetail[]): Response =>
  errorResponse({ status, code, message: MESSAGES[code] ?? FALLBACK_MESSAGE, requestId, ...(details === undefined ? {} : { details }) });

/** Status (and optionally a different wire code) for each domain error code a handler maps. */
export type DomainErrorMapping = Readonly<Record<string, { readonly status: number; readonly code?: string }>>;

/**
 * Maps an expected domain error (`Result` error with a stable `code`) to its response.
 * @throws the error itself when it is not mapped: an unmapped error is a bug and the
 *   route boundary answers 500 `INTERNAL_ERROR` (rules/error-handling.md).
 */
export const mapDomainError = (error: Error & { readonly code: string }, mapping: DomainErrorMapping, requestId: string): Response => {
  const mapped = mapping[error.code];
  if (mapped === undefined) throw error;
  return apiError(mapped.status, mapped.code ?? error.code, requestId);
};

/**
 * Success response with the `{ data, meta? }` envelope (contracts/api.md §5); `location`
 * is required by §7 for a 201.
 */
export const dataResponse = (body: { data: unknown; meta?: unknown }, options: { status?: 200 | 201 | 202; location?: string } = {}): Response =>
  Response.json(body, {
    status: options.status ?? 200,
    headers: { "cache-control": "no-store", ...(options.location === undefined ? {} : { location: options.location }) },
  });

/** `204 No Content`. */
export const noContentResponse = (): Response => new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
