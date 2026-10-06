import type { PromptEvalRunner } from "../agents/prompt-eval-route.ts";
import type { PromptBody } from "../runtime/runtime-ports.ts";
import { createFakePromptStorePort } from "../testing/fake-ports.ts";
import { EVAL_AGENT_IDS } from "./eval-dataset.ts";
import { buildEvalHarness, type EvalMode } from "./eval-harness.ts";
import { EVAL_TENANT } from "./eval-knowledge-corpus.ts";
import { runAgentEvals } from "./run-agent-evals.ts";

const hasEvalSet = (agentId: string): boolean => (EVAL_AGENT_IDS as readonly string[]).includes(agentId);

/**
 * `run-prompt-eval` (decision 0038): the agent's committed eval set in the isolated eval harness
 * (fake ports, the eval corpus and tenant, in-memory storage) with the candidate prompts injected
 * as the active ones of the harness's prompt store, gated against the agent's baseline. The
 * candidate never reaches the production runtime: there is no request-context override there.
 * In fake mode the models ignore instructions, so the verdict only proves the wiring.
 */
export const createHarnessPromptEvalRunner =
  (args: {
    readonly mode: EvalMode;
    readonly processEnv?: Readonly<Record<string, string | undefined>>;
  }): PromptEvalRunner =>
  async ({ agentId, platform, addendum }) => {
    if (!hasEvalSet(agentId)) return "NO_DATASET";
    const active: Record<string, PromptBody> = {
      ...(platform === null ? {} : { [agentId]: platform }),
      ...(addendum === null ? {} : { [`${agentId}:${EVAL_TENANT}`]: addendum }),
    };
    const harness = buildEvalHarness({
      mode: args.mode,
      ...(args.processEnv === undefined ? {} : { processEnv: args.processEnv }),
      prompts: createFakePromptStorePort({ active }),
    });
    const { report } = await runAgentEvals({ agentId, harness, reportDir: null });
    return {
      experimentId: report.runId,
      verdict: report.gate.passed ? "passed" : "failed",
      scorers: report.gate.scorers.map((scorer) => ({
        scorerId: scorer.scorerId,
        mean: scorer.mean,
        passed: scorer.passed,
      })),
      run: {
        datasetName: report.dataset.name,
        datasetVersion: report.dataset.version,
        itemCount: report.dataset.itemCount,
        startedAt: report.startedAt,
        finishedAt: report.finishedAt,
        scores: report.gate.scorers.flatMap((scorer) =>
          scorer.mean === null
            ? []
            : [{ scorer: scorer.scorerId, mean: scorer.mean, baseline: Math.max(0, scorer.floor) }],
        ),
      },
    };
  };
