import type { PromptEvalResult } from "@core/contracts";
import type { Result } from "#/services/shared/result/result.ts";

export type PromptEvalError =
  | { readonly code: "NOT_FOUND"; readonly status: 404 }
  | { readonly code: "EVAL_DATASET_MISSING"; readonly status: 422 }
  | { readonly code: "UPSTREAM_UNAVAILABLE"; readonly status: 502 | 503 };

/**
 * Runs a candidate prompt on its agent's eval set in the runtime (decision 0038): the Mastra
 * route reads the version itself, runs the isolated eval harness and records the verdict on the
 * version, so the verdict never comes from the web side.
 */
export type PromptEvalGateway = {
  readonly evaluate: (input: {
    readonly versionId: string;
    readonly tenantId: string | null;
    readonly requestId: string;
  }) => Promise<Result<PromptEvalResult, PromptEvalError>>;
};
