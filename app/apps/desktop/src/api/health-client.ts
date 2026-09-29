import { HealthResponseSchema } from "./health-response.schema.ts";

/** Stable codes the UI programs against; no raw error message reaches the screen. */
export type HealthCheckErrorCode = "NETWORK_ERROR" | "TIMEOUT" | "ABORTED" | "HTTP_ERROR" | "INVALID_RESPONSE";

export type HealthCheckError = { code: HealthCheckErrorCode; httpStatus?: number };

export type HealthCheckResult = { ok: true; status: "ok" } | { ok: false; error: HealthCheckError };

export type HealthClient = { checkHealth: (signal?: AbortSignal) => Promise<HealthCheckResult> };

const DEFAULT_TIMEOUT_MS = 5_000;

const failure = (error: HealthCheckError): HealthCheckResult => ({ ok: false, error });

const readJson = async (response: Response): Promise<unknown> => {
  try {
    return (await response.json()) as unknown;
  } catch {
    return undefined; // not JSON: reported as INVALID_RESPONSE by the schema
  }
};

const toHealthResult = async (response: Response): Promise<HealthCheckResult> => {
  if (!response.ok) return failure({ code: "HTTP_ERROR", httpStatus: response.status });
  const parsed = HealthResponseSchema.safeParse(await readJson(response));
  return parsed.success ? { ok: true, status: parsed.data.data.status } : failure({ code: "INVALID_RESPONSE" });
};

/**
 * Tiny API client for `GET {baseUrl}/v1/health` (replaced by the shared FSD
 * client in SP2). `fetch` is injected; failures are values, never throws.
 * Credentials are never sent: `/v1` is Bearer-only (spec §16.2).
 */
export const createHealthClient = (deps: {
  baseUrl: string;
  fetch: typeof fetch;
  timeoutSignal?: () => AbortSignal;
}): HealthClient => {
  const timeoutSignal = deps.timeoutSignal ?? (() => AbortSignal.timeout(DEFAULT_TIMEOUT_MS));
  return {
    checkHealth: async (signal) => {
      const timeout = timeoutSignal();
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
      try {
        const response = await deps.fetch(`${deps.baseUrl}/v1/health`, {
          method: "GET",
          credentials: "omit",
          headers: { accept: "application/json" },
          signal: combined,
        });
        return await toHealthResult(response);
      } catch {
        // fetch rejects with TypeError for network, CORS and CSP blocks alike.
        if (signal?.aborted) return failure({ code: "ABORTED" });
        if (timeout.aborted) return failure({ code: "TIMEOUT" });
        return failure({ code: "NETWORK_ERROR" });
      }
    },
  };
};
