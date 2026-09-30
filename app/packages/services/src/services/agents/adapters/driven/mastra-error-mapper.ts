import type { GatewayError } from "../../application/ports/agent-runtime-gateway.ts";
import { apiError } from "../../../shared/http/api-errors.ts";

const BY_STATUS: Readonly<Record<number, GatewayError>> = {
  400: { code: "VALIDATION_FAILED", status: 400 },
  401: { code: "UNAUTHORIZED", status: 401 },
  403: { code: "FORBIDDEN", status: 403 },
  404: { code: "NOT_FOUND", status: 404 },
  409: { code: "CONFLICT", status: 409 },
  422: { code: "VALIDATION_FAILED", status: 400 },
};

export const UPSTREAM_UNAVAILABLE: GatewayError = { code: "UPSTREAM_UNAVAILABLE", status: 502 };
export const UPSTREAM_TIMEOUT: GatewayError = { code: "UPSTREAM_UNAVAILABLE", status: 504 };

const retryAfterOf = (value: string | null | undefined): { retryAfterSeconds?: number } => {
  const seconds = value === null || value === undefined ? Number.NaN : Number(value);
  return Number.isInteger(seconds) && seconds >= 0 ? { retryAfterSeconds: seconds } : {};
};

/**
 * Maps a Mastra error status to the `/v1` error (SP3 spec §4.1, follow-up 12d).
 * Only the status is used: Mastra's `{ error }` body is never read into the
 * answer. Any other status (5xx, unexpected 4xx) is `UPSTREAM_UNAVAILABLE` 502.
 * @param retryAfter Mastra's `Retry-After` header on 429.
 */
export const mapMastraStatus = (status: number, retryAfter?: string | null): GatewayError => {
  if (status === 429) return { code: "RATE_LIMITED", status: 429, ...retryAfterOf(retryAfter) };
  return BY_STATUS[status] ?? UPSTREAM_UNAVAILABLE;
};

/** Status of an `@mastra/client-js` error (`MastraClientError.status`), duck-typed so no SDK class crosses the boundary. */
export const statusOfClientError = (error: unknown): number | undefined => {
  if (typeof error !== "object" || error === null || !("status" in error)) return undefined;
  const { status } = error;
  return typeof status === "number" ? status : undefined;
};

/**
 * `/v1` response for a gateway error (`contracts/api.md` §6): generic message,
 * `Retry-After` on 429.
 */
export const gatewayErrorResponse = (error: GatewayError, requestId: string): Response => {
  const response = apiError(error.status, error.code, requestId);
  if (error.retryAfterSeconds !== undefined) response.headers.set("retry-after", String(error.retryAfterSeconds));
  return response;
};
