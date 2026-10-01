// Generous: the first call of each route on a cold `next start` loads the server modules and the
// Firebase Admin SDK, which took more than 15 s on a loaded machine.
const REQUEST_TIMEOUT_MS = 60_000;

/** A `/v1` call answered with the error envelope; `code` is the stable error code. */
export class V1RequestError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(method: string, path: string, status: number, code: string) {
    super(`${method} ${path} → ${String(status)} ${code}`);
    this.name = "V1RequestError";
    this.code = code;
    this.status = status;
  }
}

type Envelope = { data?: unknown; error?: { code?: string } };

/**
 * Minimal `/v1` client for seeding (Bearer ID token, JSON envelopes). Specs use the UI; this only
 * prepares data the journeys start from.
 */
export const createV1Client = (args: { origin: string; idToken: string }) => {
  const request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const response = await fetch(`${args.origin}${path}`, {
      method,
      headers: { authorization: `Bearer ${args.idToken}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status === 204) return undefined as T;
    const payload = (await response.json()) as Envelope;
    if (!response.ok) throw new V1RequestError(method, path, response.status, payload.error?.code ?? "UNKNOWN");
    return payload.data as T;
  };
  return {
    get: <T>(path: string): Promise<T> => request<T>("GET", path),
    post: <T>(path: string, body: unknown): Promise<T> => request<T>("POST", path, body),
    put: <T>(path: string, body: unknown): Promise<T> => request<T>("PUT", path, body),
    patch: <T>(path: string, body: unknown): Promise<T> => request<T>("PATCH", path, body),
  };
};

export type V1Client = ReturnType<typeof createV1Client>;
