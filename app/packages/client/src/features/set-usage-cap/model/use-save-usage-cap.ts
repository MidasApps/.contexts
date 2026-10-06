"use client";

import { type BudgetCaps, updateAgentSettingsEndpoint } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { tenantAgentSettingsKeys } from "#/entities/agent-settings/index.ts";
import { usageKeys } from "#/entities/usage/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { ApiError } from "#/shared/api/api-error.ts";
import { useDescribeError } from "#/shared/lib/errors/describe-error.ts";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";

/** The API answers 400 `VALIDATION_FAILED` with issue `ABOVE_PLAN` when the own cap exceeds the plan. */
const isAbovePlan = (error: unknown): boolean =>
  error instanceof ApiError &&
  error.code === "VALIDATION_FAILED" &&
  (error.details ?? []).some((detail) => detail.issue === "ABOVE_PLAN");

/**
 * Saves (`budget`) or removes (`null`) the organization's own cap, one write at a time: `pending`
 * says which is running, `failure` is the sentence to show above the form (with the reference).
 */
export const useSaveUsageCap = (organizationId: string) => {
  const t = useTranslations("settings.usage.ownCap");
  const describe = useDescribeError();
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState<"save" | "remove" | null>(null);

  /** Resolves `true` once saved; a failure is shown above the form. */
  const send = async (budget: BudgetCaps | null, kind: "save" | "remove"): Promise<boolean> => {
    setPending(kind);
    setFailure(null);
    try {
      await callEndpoint(updateAgentSettingsEndpoint, { query: { organizationId }, body: { budget } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: tenantAgentSettingsKeys.one(organizationId) }),
        queryClient.invalidateQueries({ queryKey: usageKeys.all(organizationId) }),
      ]);
      notify.success(t(kind === "save" ? "saved" : "removed"));
      return true;
    } catch (error: unknown) {
      const described = describe(error);
      setFailure(
        isAbovePlan(error)
          ? t("abovePlan")
          : described.requestId === undefined
            ? described.message
            : t("failureWithReference", { message: described.message, requestId: described.requestId }),
      );
      return false;
    } finally {
      setPending(null);
    }
  };

  return { send, pending, failure };
};
