import type { AgentSettings } from "@core/contracts";
import type { ConsoleDeps } from "../../../platform/application/console-deps.ts";
import { baseCapsOf, storedSettingsOf } from "../../../platform/application/use-cases/sync-tenant-budget.ts";
import { resolveTenantCaps } from "../../../usage/domain/budget-policy.ts";

export type GetAgentSettings = (input: { readonly tenantId: string }) => Promise<AgentSettings>;

/**
 * An organization's agent settings (SP3 spec §6, SP5 spec §7): the stored document, or the
 * defaults (core subagents, web off, PII `redact`) with the caps in force. Also the Mastra
 * `SettingsPort` read, so the PII mode and enabled agents come from here (SP3 Task 17 concern 4).
 */
export const makeGetAgentSettings =
  (deps: Pick<ConsoleDeps, "agentSettings" | "organizations" | "plans" | "clock">): GetAgentSettings =>
  async ({ tenantId }) => {
    const stored = await deps.agentSettings.get(tenantId);
    if (stored !== null) return stored.settings;
    const base = await baseCapsOf(deps, tenantId);
    return (await storedSettingsOf(deps, tenantId, resolveTenantCaps({ plan: base.plan, override: base.override, selfCap: null }).caps)).settings;
  };
