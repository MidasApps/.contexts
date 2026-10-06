import { ErrorEnvelopeSchema } from "@core/contracts";
import { ulid } from "ulid";
import type { ApiConnection } from "./api-context.tsx";
import { ApiError } from "./api-error.ts";

export type RawRequest = {
  readonly method: "GET" | "POST";
  /** Path with query string, e.g. `/v1/voice/speech?organizationId=…`. */
  readonly path: string;
  /** Sent as it is: `FormData` (multipart, the browser sets the boundary) or a JSON string. */
  readonly body?: FormData | string | undefined;
  readonly contentType?: string | undefined;
  readonly accept?: string | undefined;
  readonly signal?: AbortSignal | undefined;
};

const toApiError = async (response: Response, requestId: string): Promise<ApiError> => {
  const body: unknown = await response.json().catch(() => undefined);
  const envelope = ErrorEnvelopeSchema.safeParse(body);
  if (envelope.success) {
    const { code, message, details, requestId: bodyRequestId } = envelope.data.error;
    return new ApiError({ status: response.status, code, message, details, requestId: bodyRequestId });
  }
  return new ApiError({
    status: response.status,
    code: "INVALID_RESPONSE",
    message: "Unexpected error response.",
    requestId,
  });
};

/**
 * A `/v1` call whose body or answer is not JSON (the binary exceptions of `api.md` §4: the voice
 * upload is multipart, speech answers audio). Same rules as the JSON client: Bearer token asked
 * per request, a ULID `x-request-id`, no cookies, failures as `ApiError`. Nothing is retried: the
 * calls it serves are not idempotent and are billed.
 * @throws {ApiError} for an error envelope, an unexpected error body or a network failure.
 */
export const sendRawRequest = async (connection: ApiConnection, request: RawRequest): Promise<Response> => {
  const requestId = ulid();
  const token = await connection.getIdToken({ forceRefresh: false });
  const headers = new Headers({ "x-request-id": requestId });
  if (token !== null) headers.set("authorization", `Bearer ${token}`);
  if (request.contentType !== undefined) headers.set("content-type", request.contentType);
  if (request.accept !== undefined) headers.set("accept", request.accept);
  let response: Response;
  try {
    response = await connection.fetch(`${connection.baseUrl}${request.path}`, {
      method: request.method,
      headers,
      credentials: "omit",
      ...(request.body === undefined ? {} : { body: request.body }),
      ...(request.signal === undefined ? {} : { signal: request.signal }),
    });
  } catch (error: unknown) {
    if (request.signal?.aborted === true) throw error;
    throw new ApiError(
      { status: 0, code: "NETWORK_ERROR", message: "Network request failed.", requestId },
      { cause: error },
    );
  }
  if (!response.ok) throw await toApiError(response, requestId);
  return response;
};
