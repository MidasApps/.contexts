import { FORWARDED_HEADERS, PromptEvalResultSchema } from "@core/contracts";
import { z } from "zod";
import type { PromptEvalError, PromptEvalGateway } from "../../application/ports/prompt-eval-gateway.ts";
import type { ServerlessIdTokenSource } from "./serverless-id-token.ts";

/** An eval set runs every case through the agent: minutes in real mode. */
export const DEFAULT_PROMPT_EVAL_TIMEOUT_MS = 10 * 60_000;

const ResponseSchema = z.object({ data: PromptEvalResultSchema });
const UNAVAILABLE: PromptEvalError = { code: "UPSTREAM_UNAVAILABLE", status: 503 };

const errorOf = (status: number): PromptEvalError =>
  status === 404
    ? { code: "NOT_FOUND", status: 404 }
    : status === 422
      ? { code: "EVAL_DATASET_MISSING", status: 422 }
      : { code: "UPSTREAM_UNAVAILABLE", status: 502 };

/**
 * `PromptEvalGateway` over the Mastra route `POST /prompt-evals/:versionId` (a custom route outside
 * the API prefix, behind Cloud Run IAM like the settle route of decision 0036). It sends no user
 * credential: `/v1` already authorized the caller for the prompt line, and the runtime re-reads the
 * version under the given tenant scope. Status-only error mapping; an error body is never read.
 */
export const createMastraPromptEvalGateway = (options: {
  readonly baseUrl: string;
  readonly serverlessToken: ServerlessIdTokenSource | null;
  readonly timeoutMs?: number;
  readonly fetch?: typeof fetch;
}): PromptEvalGateway => {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const fetchFn = options.fetch ?? fetch;
  return {
    evaluate: async ({ versionId, tenantId, requestId }) => {
      const signal = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_PROMPT_EVAL_TIMEOUT_MS);
      try {
        const headers: Record<string, string> = {
          "content-type": "application/json",
          [FORWARDED_HEADERS.requestId]: requestId,
          ...(options.serverlessToken === null
            ? {}
            : { [FORWARDED_HEADERS.serverlessAuthorization]: await options.serverlessToken.headerValue() }),
        };
        const response = await fetchFn(`${baseUrl}/prompt-evals/${encodeURIComponent(versionId)}`, {
          method: "POST",
          headers,
          body: JSON.stringify({ tenantId }),
          signal,
        });
        if (!response.ok) {
          await response.body?.cancel();
          return { ok: false, error: errorOf(response.status) };
        }
        const parsed = ResponseSchema.safeParse(await response.json());
        return parsed.success ? { ok: true, data: parsed.data.data } : { ok: false, error: UNAVAILABLE };
      } catch {
        return { ok: false, error: UNAVAILABLE };
      }
    },
  };
};
