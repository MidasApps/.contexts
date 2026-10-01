import type { AuditWriter } from "../../audit/application/use-cases/record-audit.ts";
import type { Clock } from "../../shared/clock/clock.ts";
import type { ConsoleGateway } from "../../observability/application/ports/console-gateway.ts";
import type { AgentSettingsRepository, ApprovalStats, ConsoleUsage, OrganizationAdminStore, PlanRepository } from "./ports/console-ports.ts";

/** What the staff console and agent settings use cases need (SP5 Task 10, decision 0039). */
export type ConsoleDeps = {
  readonly plans: PlanRepository;
  readonly organizations: OrganizationAdminStore;
  readonly agentSettings: AgentSettingsRepository;
  readonly usage: ConsoleUsage;
  readonly audit: AuditWriter;
  readonly clock: Clock;
  /** Overview approval rate; absent where nothing reads it (the Mastra settings port). */
  readonly approvals?: ApprovalStats;
  /** Overview eval status from the runtime's experiments; absent: `unknown`. */
  readonly evals?: Pick<ConsoleGateway, "listExperiments">;
};
