"use client";

import { adminEvaluatePromptVersionEndpoint, type PromptAgentId, type PromptEvalResult, type PromptVersion } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { promptVersionKeys } from "#/entities/prompt-version/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";

export type PromptEvalOutcome = { readonly version: PromptVersion; readonly result: PromptEvalResult };

export type RunPromptEval = {
  /** Version whose eval is running; the row shows a pending button and others wait. */
  readonly pendingId: string | null;
  /** Result of the last eval run in this page. */
  readonly outcome: PromptEvalOutcome | null;
  /** Failure of the last run (an `ApiError` keeps its code and request id). */
  readonly error: { readonly version: PromptVersion; readonly cause: unknown } | null;
  readonly run: (version: PromptVersion) => Promise<void>;
};

/**
 * Runs the agent's eval set with one version (`POST …/prompt-versions/{id}/eval`): the verdict is
 * recorded on the version by the server, so the lists refetch afterwards, pass or fail.
 */
export const useRunPromptEval = (agentId: PromptAgentId): RunPromptEval => {
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<PromptEvalOutcome | null>(null);
  const [error, setError] = useState<RunPromptEval["error"]>(null);
  const run = async (version: PromptVersion): Promise<void> => {
    if (pendingId !== null) return;
    setPendingId(version.id);
    setError(null);
    try {
      const { data } = await callEndpoint(adminEvaluatePromptVersionEndpoint, { params: { agentId, versionId: version.id } });
      setOutcome({ version, result: data });
    } catch (cause: unknown) {
      setError({ version, cause });
    } finally {
      setPendingId(null);
      void queryClient.invalidateQueries({ queryKey: promptVersionKeys.agent(agentId) });
    }
  };
  return { pendingId, outcome, error, run };
};
