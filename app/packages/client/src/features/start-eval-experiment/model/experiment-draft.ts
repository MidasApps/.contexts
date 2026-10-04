import type { AgentSettings } from "@core/contracts";
import { ApiError } from "#/shared/api/api-error.ts";

/** The supervisor: always evaluable, whatever the organization enabled (`start-experiment.ts` on the server). */
export const SUPERVISOR_AGENT_ID = "assistant";

/** Agents the API accepts for an experiment: the supervisor, then the organization's enabled subagents. */
export const evaluableAgents = (settings: Pick<AgentSettings, "enabledAgents"> | undefined): string[] => [
  SUPERVISOR_AGENT_ID,
  ...(settings?.enabledAgents ?? []).filter((key) => key !== SUPERVISOR_AGENT_ID),
];

export type ExperimentDraft = { datasetId: string; agentId: string };
export type ExperimentDraftProblem = "datasetRequired" | "agentRequired" | "agentNotEnabled" | "datasetNotFound";
export type ExperimentDraftProblems = { dataset?: ExperimentDraftProblem; agent?: ExperimentDraftProblem };

/** What is missing before the request is worth sending. */
export const validateExperimentDraft = (draft: ExperimentDraft): ExperimentDraftProblems => ({
  ...(draft.datasetId === "" ? { dataset: "datasetRequired" as const } : {}),
  ...(draft.agentId === "" ? { agent: "agentRequired" as const } : {}),
});

/**
 * A refusal the form can pin to a field: 400 with `agentId: AGENT_NOT_ENABLED` (the agent was
 * disabled meanwhile) or 404 (the dataset is gone or belongs to another organization). Anything
 * else is `null` and shows as a general error with its reference.
 */
export const refusalProblems = (error: unknown): ExperimentDraftProblems | null => {
  if (!(error instanceof ApiError)) return null;
  if (
    error.status === 400 &&
    (error.details ?? []).some((detail) => detail.field === "agentId" && detail.issue === "AGENT_NOT_ENABLED")
  )
    return { agent: "agentNotEnabled" };
  if (error.status === 404) return { dataset: "datasetNotFound" };
  return null;
};
