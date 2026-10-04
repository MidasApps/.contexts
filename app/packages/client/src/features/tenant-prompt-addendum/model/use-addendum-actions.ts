"use client";

import {
  activateAddendumEndpoint,
  evaluateAddendumVersionEndpoint,
  type PromptAgentId,
  type PromptVersion,
} from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { tenantAddendumKeys } from "#/entities/prompt-version/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { useDescribeError } from "#/shared/lib/errors/describe-error.ts";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";

export type AddendumAction = "evaluate" | "activate";

export type AddendumActions = {
  /** The version and action in flight; other buttons wait. */
  readonly pending: { readonly versionId: string; readonly action: AddendumAction } | null;
  /** Why the last action failed (the message of its error code, with the request reference). */
  readonly failure: string | null;
  readonly evaluate: (version: PromptVersion) => Promise<void>;
  readonly activate: (version: PromptVersion) => Promise<void>;
};

/**
 * Evaluates and activates an organization's addendum version (core.prompt.write). The server
 * records the verdict on the version and refuses to activate one without a passed verdict
 * (409 `EVAL_REQUIRED`); an organization cannot force. The lists refetch after either action.
 */
export const useAddendumActions = (organizationId: string, agentId: PromptAgentId): AddendumActions => {
  const t = useTranslations();
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const describe = useDescribeError();
  const [pending, setPending] = useState<AddendumActions["pending"]>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const run = async (version: PromptVersion, action: AddendumAction, work: () => Promise<string>): Promise<void> => {
    if (pending !== null) return;
    setPending({ versionId: version.id, action });
    setFailure(null);
    try {
      notify.success(await work());
    } catch (error: unknown) {
      const described = describe(error);
      setFailure(
        described.requestId === undefined
          ? described.message
          : t("common.errorState.messageWithReference", { message: described.message, requestId: described.requestId }),
      );
    } finally {
      await queryClient.invalidateQueries({ queryKey: tenantAddendumKeys.agent(organizationId, agentId) });
      setPending(null);
    }
  };

  const evaluate = (version: PromptVersion): Promise<void> =>
    run(version, "evaluate", async () => {
      const { data } = await callEndpoint(evaluateAddendumVersionEndpoint, {
        params: { agentId, versionId: version.id },
        query: { organizationId },
      });
      return t(
        data.verdict === "passed"
          ? "settings.agents.instructions.evalPassed"
          : "settings.agents.instructions.evalFailed",
        { version: version.version },
      );
    });

  const activate = (version: PromptVersion): Promise<void> =>
    run(version, "activate", async () => {
      await callEndpoint(activateAddendumEndpoint, {
        params: { agentId },
        query: { organizationId },
        body: { versionId: version.id },
      });
      return t("settings.agents.instructions.activated", { version: version.version });
    });

  return { pending, failure, evaluate, activate };
};
