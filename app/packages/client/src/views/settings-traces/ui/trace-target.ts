import type { TraceSummary } from "@core/contracts";
import { useTranslations } from "use-intl";

/** What ran: the agent, else the workflow of the root span. */
export const useTargetLabel = (): ((trace: Pick<TraceSummary, "agentId" | "workflowId">) => string) => {
  const t = useTranslations("settings.traces");
  return (trace) => {
    if (trace.agentId !== null) return t("agentTarget", { id: trace.agentId });
    if (trace.workflowId !== null) return t("workflowTarget", { id: trace.workflowId });
    return t("noTarget");
  };
};
