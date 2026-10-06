/** The api.md §6 error body of a console route; `requestId` is the caller's `x-request-id`. */
type ErrorBody = { readonly error: { readonly code: string; readonly message: string; requestId?: string } };

const isErrorBody = (body: unknown): body is ErrorBody =>
  typeof body === "object" && body !== null && "error" in body && typeof body.error === "object";

/**
 * Adds the request id to an error answer of a console route, so the envelope matches
 * `/v1` (contracts/api.md §6) and the log line of a failure can be found from the response.
 */
export const withRequestId = async (response: Response, requestId: string | undefined): Promise<Response> => {
  if (response.status < 400 || requestId === undefined) return response;
  const body: unknown = await response
    .clone()
    .json()
    .catch(() => null);
  if (!isErrorBody(body) || body.error.requestId !== undefined) return response;
  return Response.json({ error: { ...body.error, requestId } }, { status: response.status });
};
