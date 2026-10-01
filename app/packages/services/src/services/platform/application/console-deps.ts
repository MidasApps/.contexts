import type { AuditWriter } from "../../audit/application/use-cases/record-audit.ts";
import type { Clock } from "../../shared/clock/clock.ts";
import type { AgentSettingsRepository, ConsoleUsage, OrganizationAdminStore, PlanRepository } from "./ports/console-ports.ts";

/** What the staff console and agent settings use cases need (SP5 Task 10, decision 0039). */
export type ConsoleDeps = {
  readonly plans: PlanRepository;
  readonly organizations: OrganizationAdminStore;
  readonly agentSettings: AgentSettingsRepository;
  readonly usage: ConsoleUsage;
  readonly audit: AuditWriter;
  readonly clock: Clock;
};
