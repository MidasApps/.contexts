import { REQUEST_ID_HEADER } from "../observability/request-id.ts";

/** One granular problem, e.g. a field that failed validation (contracts/api.md §6). */
export type ErrorDetail = { field: string; issue: string };

/** Error body of contracts/api.md §6; clients program against `code`. */
export type ErrorEnvelope = {
  error: {
    code: string;
    message: string;
    details?: ErrorDetail[];
    requestId: string;
  };
};

/**
 * Builds the canonical error response. `message` is short, user-facing and
 * generic: never a stack, query, env value or raw SDK message (§6.2).
 */
export const errorResponse = (args: {
  status: number;
  code: string;
  message: string;
  details?: ErrorDetail[];
  requestId: string;
}): Response => {
  const { status, code, message, details, requestId } = args;
  const body: ErrorEnvelope = {
    error: { code, message, ...(details === undefined ? {} : { details }), requestId },
  };
  return Response.json(body, {
    status,
    headers: { [REQUEST_ID_HEADER]: requestId, "cache-control": "no-store" },
  });
};
