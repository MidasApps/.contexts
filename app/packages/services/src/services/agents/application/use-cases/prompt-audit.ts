import { type AuditAction, TenantIdSchema, type UserPrincipal } from "@core/contracts";
import { auditActorOf } from "../../../audit/domain/audit-actor.ts";
import type { PromptKey } from "../ports/prompt-repository.ts";
import type { PromptDeps } from "../prompt-deps.ts";

/**
 * Audit of a prompt store write: staff writes of platform prompts on the platform log, a tenant's
 * addendum writes on its own log. Bodies are never audited (only ids, the hash and the reason).
 */
export const recordPromptAudit = (
  deps: Pick<PromptDeps, "audit">,
  args: {
    readonly action: Extract<AuditAction, "PROMPT_VERSION_CREATED" | "PROMPT_EVALUATED" | "PROMPT_ACTIVATED" | "PROMPT_ACTIVATION_FORCED">;
    readonly actor: UserPrincipal;
    readonly key: PromptKey;
    readonly targetId: string;
    readonly requestId: string;
    readonly reason?: string | null;
    readonly fingerprint?: string;
  },
) => {
  const common = {
    action: args.action,
    actor: auditActorOf(args.actor),
    target: { type: "prompt-version", id: args.targetId },
    outcome: "success" as const,
    requestId: args.requestId,
    ...(args.reason === undefined || args.reason === null ? {} : { reason: args.reason }),
    ...(args.fingerprint === undefined ? {} : { metadata: { fingerprint: args.fingerprint } }),
  };
  if (args.key.tenantId === null) return deps.audit.record({ log: "platform", ...common });
  const tenantId = TenantIdSchema.parse(args.key.tenantId);
  return deps.audit.record({ log: "tenant", ...common, tenantId, node: { level: "organization", tenantId } });
};
