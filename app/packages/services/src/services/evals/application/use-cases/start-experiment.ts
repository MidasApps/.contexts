import type { AgentSettings, StartEvalExperimentInput, UserPrincipal } from "@core/contracts";
import type { ConsoleGateway, ConsoleResult } from "#/services/observability/application/ports/console-gateway.ts";

/** The supervisor always runs; any other agent must be enabled in the organization's settings. */
export const SUPERVISOR_AGENT_ID = "assistant";

export type StartExperiment = (command: {
  readonly actor: UserPrincipal;
  readonly tenantId: string;
  readonly input: StartEvalExperimentInput;
  readonly requestId: string;
}) => Promise<ConsoleResult<{ readonly experimentId: string }>>;

/**
 * `POST /v1/evals/experiments` (SP5 spec §7): runs an agent on one of the organization's datasets
 * as the caller. The agent must be enabled for the organization (`agent-settings.enabledAgents`, the
 * supervisor always is), else 400 `AGENT_NOT_ENABLED`; the runtime then reads the dataset under the
 * organization (another tenant's answers 404) and runs with the caller's current grants.
 */
export const makeStartExperiment =
  (deps: {
    readonly console: Pick<ConsoleGateway, "startExperiment">;
    readonly getAgentSettings: (input: { tenantId: string }) => Promise<AgentSettings>;
  }): StartExperiment =>
  async ({ actor, tenantId, input, requestId }) => {
    const settings = await deps.getAgentSettings({ tenantId });
    if (input.agentId !== SUPERVISOR_AGENT_ID && !settings.enabledAgents.includes(input.agentId))
      return { ok: false, error: { code: "AGENT_NOT_ENABLED", status: 400 } };
    return deps.console.startExperiment({
      tenantId,
      userId: actor.uid,
      datasetId: input.datasetId,
      agentId: input.agentId,
      requestId,
    });
  };
