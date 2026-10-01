import type { PromptEvalResult } from "@core/contracts";
import type { Logger } from "@core/services";
import { type ApiRoute, registerApiRoute } from "@mastra/core/server";
import { z } from "zod";
import type { PromptBody, PromptStorePort } from "../runtime/runtime-ports.ts";
import { type EvalRunRecord, type ExperimentStore, recordEvalRun } from "../console/eval-console.ts";

/** Custom route outside the API prefix (decision 0038); `/v1` reaches it through the prompt eval gateway. */
export const PROMPT_EVAL_ROUTE_PATH = "/prompt-evals/:versionId";

/**
 * Runs an agent's committed eval set in the isolated eval harness with the candidate prompts and
 * gates the means against the agent's baseline (decision 0028). `NO_DATASET` when the agent has no
 * eval set (its prompts can then only be force-activated by staff).
 */
export type PromptEvalRunner = (input: {
  readonly agentId: string;
  readonly platform: PromptBody | null;
  readonly addendum: PromptBody | null;
}) => Promise<PromptEvalOutcome | "NO_DATASET">;

/** A runner's verdict plus what the experiment record keeps (dataset, timing, scores with baseline floors). */
export type PromptEvalOutcome = Omit<PromptEvalResult, "versionId"> & {
  readonly run?: Pick<EvalRunRecord, "datasetName" | "datasetVersion" | "itemCount" | "scores" | "startedAt" | "finishedAt">;
};

export type PromptEvalRouteDeps = {
  readonly prompts: PromptStorePort;
  /** Absent when the runtime cannot run evals (the route answers 503). */
  readonly runner: PromptEvalRunner | undefined;
  readonly logger: Pick<Logger, "info" | "error">;
  /** Records the run as a Mastra experiment (its id becomes the version's `evalExperimentId`). */
  readonly experiments?: ExperimentStore;
};

const BodySchema = z.strictObject({ tenantId: z.string().min(1).max(128).nullable() });
const VERSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const json = (status: number, body: unknown): Response => Response.json(body, { status });

// The experiment record of the run when the storage has one, else the runner's own run id.
const experimentIdOf = async (deps: PromptEvalRouteDeps, version: { versionId: string; agentId: string; tenantId: string | null }, outcome: PromptEvalOutcome): Promise<string> => {
  if (deps.experiments === undefined || outcome.run === undefined) return outcome.experimentId;
  const run: EvalRunRecord = { ...outcome.run, agentId: version.agentId, verdict: outcome.verdict, source: "prompt-eval", promptVersionId: version.versionId, gitSha: null };
  return recordEvalRun(deps.experiments, run, version.tenantId);
};
const errorOf = (status: number, code: string, requestId: string | null): Response => json(status, { error: { code, message: code, ...(requestId === null ? {} : { requestId }) } });

// A tenant addendum runs on top of the active platform prompt; a platform version runs alone.
const candidatesOf = async (prompts: PromptStorePort, version: NonNullable<Awaited<ReturnType<PromptStorePort["getVersion"]>>>) => {
  const own: PromptBody = { versionId: version.versionId, body: version.body };
  if (version.scope === "platform") return { platform: own, addendum: null };
  return { platform: (await prompts.getActive({ agentId: version.agentId, tenantId: null })).platform, addendum: own };
};

/**
 * `POST /prompt-evals/:versionId` `{ tenantId }`: reads the version under that tenant scope (a
 * version of another tenant reads as missing), runs the eval set and records the verdict on the
 * version itself, so the verdict never comes from the caller. No user Bearer: `/v1` authorized the
 * caller for the prompt line; outside local Cloud Run IAM guards the runtime (like decision 0036).
 */
export const handlePromptEval = async (input: { readonly versionId: string; readonly body: unknown; readonly requestId: string | null; readonly deps: PromptEvalRouteDeps }): Promise<Response> => {
  const { deps, requestId } = input;
  const correlation = requestId === null ? {} : { requestId };
  const body = BodySchema.safeParse(input.body);
  if (!VERSION_ID.test(input.versionId) || !body.success) return errorOf(404, "NOT_FOUND", requestId);
  if (deps.runner === undefined) return errorOf(503, "UPSTREAM_UNAVAILABLE", requestId);
  try {
    const version = await deps.prompts.getVersion({ versionId: input.versionId, tenantId: body.data.tenantId });
    if (version === null || version.tenantId !== body.data.tenantId) return errorOf(404, "NOT_FOUND", requestId);
    const outcome = await deps.runner({ agentId: version.agentId, ...(await candidatesOf(deps.prompts, version)) });
    if (outcome === "NO_DATASET") return errorOf(422, "EVAL_DATASET_MISSING", requestId);
    const experimentId = await experimentIdOf(deps, version, outcome);
    await deps.prompts.recordEval({ versionId: version.versionId, tenantId: version.tenantId, experimentId, verdict: outcome.verdict });
    deps.logger.info("prompt_eval_finished", { ...correlation, versionId: version.versionId, agentId: version.agentId, verdict: outcome.verdict });
    return json(200, { data: { versionId: version.versionId, experimentId, verdict: outcome.verdict, scorers: outcome.scorers } });
  } catch (error: unknown) {
    deps.logger.error("prompt_eval_failed", { ...correlation, versionId: input.versionId, err: error });
    return errorOf(502, "UPSTREAM_UNAVAILABLE", requestId);
  }
};

export const createPromptEvalRoutes = (deps: PromptEvalRouteDeps): ApiRoute[] => [
  registerApiRoute(PROMPT_EVAL_ROUTE_PATH, {
    method: "POST",
    requiresAuth: false,
    handler: async (context) => {
      const experiments = (await context.get("mastra").getStorage()?.getStore("experiments")) as ExperimentStore | undefined;
      return handlePromptEval({
        versionId: context.req.param("versionId"),
        body: await context.req.json().catch(() => null),
        requestId: context.req.header("x-request-id") ?? null,
        deps: experiments === undefined ? deps : { ...deps, experiments },
      });
    },
  }),
];
