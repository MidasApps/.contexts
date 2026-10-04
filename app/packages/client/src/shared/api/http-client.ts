import { type EndpointAuth, ErrorEnvelopeSchema, type HttpMethod } from "@core/contracts";
import { ulid } from "ulid";
import { ApiError } from "./api-error.ts";

/** The subset of `fetch` the client needs (injectable in tests and per host). */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type GetIdToken = (options: { forceRefresh: boolean }) => Promise<string | null>;

export type HttpClientOptions = {
  /** API origin; `""` on web (same origin), `VITE_API_URL` on desktop. */
  baseUrl: string;
  /** Firebase ID token of the signed-in user (`shared/lib/auth`); `null` when signed out. */
  getIdToken: GetIdToken;
  fetch: FetchLike;
  /** Per-attempt timeout (default 15 s). */
  timeoutMs?: number;
  /** Request id factory (default ULID, contracts/api.md §11.1). */
  newRequestId?: () => string;
};

export type HttpRequest = {
  method: HttpMethod;
  /** Path with query string, e.g. `/v1/me?x=1`. */
  path: string;
  body?: unknown;
  idempotencyKey?: string | undefined;
  auth?: EndpointAuth | undefined;
  signal?: AbortSignal | undefined;
};

export type HttpResponse = { status: number; body: unknown; requestId: string | undefined };

export type HttpClient = { request: (request: HttpRequest) => Promise<HttpResponse> };

const DEFAULT_TIMEOUT_MS = 15_000;
const IDEMPOTENT_METHODS = new Set<HttpMethod>(["GET", "PUT", "DELETE"]);

type Attempt = { request: HttpRequest; token: string | null; requestId: string };

const buildHeaders = ({ request, token, requestId }: Attempt): Headers => {
  const headers = new Headers({ accept: "application/json", "x-request-id": requestId });
  if (token !== null) headers.set("authorization", `Bearer ${token}`);
  if (request.body !== undefined) headers.set("content-type", "application/json");
  if (request.idempotencyKey !== undefined) headers.set("idempotency-key", request.idempotencyKey);
  return headers;
};

const readJson = async (response: Response): Promise<{ ok: true; value: unknown } | { ok: false }> => {
  const text = await response.text();
  if (text === "") return { ok: true, value: undefined };
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    // Not JSON (proxy error page, truncated body): the caller maps it to INVALID_RESPONSE.
    return { ok: false };
  }
};

const toApiError = (
  status: number,
  body: { ok: true; value: unknown } | { ok: false },
  requestId: string | undefined,
): ApiError => {
  const envelope = body.ok ? ErrorEnvelopeSchema.safeParse(body.value) : undefined;
  if (envelope?.success === true) {
    const { code, message, details, requestId: bodyRequestId } = envelope.data.error;
    return new ApiError({ status, code, message, details, requestId: bodyRequestId });
  }
  return new ApiError({ status, code: "INVALID_RESPONSE", message: "Unexpected error response.", requestId });
};

/** A failed fetch: the caller's abort passes through; our timeout and network errors become ApiError. */
const toFetchFailure = (
  thrown: unknown,
  callerSignal: AbortSignal | undefined,
  timeout: AbortSignal,
  requestId: string,
): unknown => {
  if (callerSignal?.aborted === true) return thrown;
  if (timeout.aborted)
    return new ApiError({ status: 0, code: "TIMEOUT", message: "Request timed out.", requestId }, { cause: thrown });
  return new ApiError(
    { status: 0, code: "NETWORK_ERROR", message: "Network request failed.", requestId },
    { cause: thrown },
  );
};

/**
 * Fetch wrapper for `/v1` (decision 0011): `Authorization: Bearer <Firebase ID token>`, a ULID
 * `x-request-id` per attempt, `AbortSignal` + timeout, error envelope → `ApiError`. A 401 forces
 * one token refresh and retries once, only for idempotent calls (GET/PUT/DELETE or a call with
 * `Idempotency-Key`); nothing else is retried here (TanStack Query owns query retries).
 */
export const createHttpClient = ({
  baseUrl,
  getIdToken,
  fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  newRequestId = ulid,
}: HttpClientOptions): HttpClient => {
  const attempt = async (request: HttpRequest, forceRefresh: boolean): Promise<Response> => {
    const token = request.auth === "none" ? null : await getIdToken({ forceRefresh });
    const requestId = newRequestId();
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = request.signal === undefined ? timeout : AbortSignal.any([request.signal, timeout]);
    const init: RequestInit = { method: request.method, headers: buildHeaders({ request, token, requestId }), signal };
    if (request.body !== undefined) init.body = JSON.stringify(request.body);
    try {
      return await fetch(`${baseUrl}${request.path}`, init);
    } catch (thrown: unknown) {
      throw toFetchFailure(thrown, request.signal, timeout, requestId);
    }
  };

  const request = async (input: HttpRequest): Promise<HttpResponse> => {
    let response = await attempt(input, false);
    const retryable = IDEMPOTENT_METHODS.has(input.method) || input.idempotencyKey !== undefined;
    if (response.status === 401 && input.auth !== "none" && retryable) response = await attempt(input, true);
    const requestId = response.headers.get("x-request-id") ?? undefined;
    const body = await readJson(response);
    if (!response.ok) throw toApiError(response.status, body, requestId);
    if (!body.ok)
      throw new ApiError({
        status: response.status,
        code: "INVALID_RESPONSE",
        message: "Response is not JSON.",
        requestId,
      });
    return { status: response.status, body: body.value, requestId };
  };

  return { request };
};
