import { CoreErrorCodeSchema } from "@core/contracts";
import { z } from "zod";
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
 * Maps a Mastra error status to the `/v1` error (SP3 spec §4.1, follow-up 12d): the fallback of
 * `mapMastraError` when the body carries no core code. Any other status (5xx, unexpected 4xx) is
 * `UPSTREAM_UNAVAILABLE` 502.
 * @param retryAfter Mastra's `Retry-After` header on 429.
 */
export const mapMastraStatus = (status: number, retryAfter?: string | null): GatewayError => {
  if (status === 429) return { code: "RATE_LIMITED", status: 429, ...retryAfterOf(retryAfter) };
  return BY_STATUS[status] ?? UPSTREAM_UNAVAILABLE;
};

// Only the code of Mastra's api.md §6 envelope is read; message and details never reach /v1.
const MastraErrorBodySchema = z.object({ error: z.object({ code: CoreErrorCodeSchema }) });


/**
 * `/v1` error of a non-2xx Mastra answer: the envelope's `code` when it is a core code
 * (`CORE_ERROR_CODES`, e.g. 503 `FEATURE_DISABLED` of the kill-switch), with Mastra's status
 * (`VALIDATION_FAILED` is always 400); else the caller's own status mapping; else `mapMastraStatus`.
 * @param body the parsed body (`undefined` when unreadable or not JSON).
 */
export const mapMastraError = (input: {
  readonly status: number;
  readonly body: unknown;
  readonly retryAfter?: string | null | undefined;
  readonly mapStatus?: ((status: number) => GatewayError | undefined) | undefined;
}): GatewayError => {
  const parsed = MastraErrorBodySchema.safeParse(input.body);
  const code = parsed.success ? parsed.data.error.code : undefined;
  // Mastra is upstream of /v1: its own crash stays UPSTREAM_UNAVAILABLE 502, never /v1's INTERNAL_ERROR.
  if (code !== undefined && code !== "INTERNAL_ERROR" && input.status >= 400) {
    if (code === "RATE_LIMITED") return mapMastraStatus(429, input.retryAfter);
    return { code, status: code === "VALIDATION_FAILED" ? 400 : input.status };
  }
  return input.mapStatus?.(input.status) ?? mapMastraStatus(input.status, input.retryAfter);
};

/** Body of a non-2xx answer as JSON, or `undefined` (read once; an error envelope is small). */
export const errorBodyOf = async (response: Response): Promise<unknown> => {
  if (!(response.headers.get("content-type") ?? "").includes("json")) {
    await response.body?.cancel();
    return undefined;
  }
  return response.json().catch(() => undefined);
};

/** Status and parsed body of an `@mastra/client-js` error (`MastraClientError`), duck-typed. */
export const bodyOfClientError = (error: unknown): unknown => (typeof error === "object" && error !== null && "body" in error ? error.body : undefined);

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
