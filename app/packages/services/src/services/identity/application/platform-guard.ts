import type { TenantId, UserId, UserPrincipal } from "@core/contracts";
import type { RequestAccess } from "../../access/composition.ts";
import { AccessDeniedError } from "../../access/domain/errors/access-denied-error.ts";
import { auditActorOf } from "../../audit/domain/audit-actor.ts";
import { err, ok, type Result } from "../../shared/result/result.ts";
import type { PlatformDeps } from "./platform-deps.ts";

/**
 * `platform.user.impersonate` with MFA (SP1 spec §3.4, §6.6). Never from an impersonated
 * token (a session cannot open or end sessions). A refusal is audited on the platform log
 * as `PLATFORM_ACCESS_DENIED` with the deny reason as `errorCode` (SP1 spec §6.7).
 */
export const requireImpersonateRight = async (
  deps: Pick<PlatformDeps, "audit">,
  args: { actor: UserPrincipal; access: RequestAccess; targetUid: UserId | null; targetTenantId: TenantId | null; requestId: string },
): Promise<Result<void, AccessDeniedError>> => {
  if (args.actor.impersonation !== undefined) return err(new AccessDeniedError("IMPERSONATION_READ_ONLY"));
  const decision = await args.access.authorize({ principal: args.actor, permission: "platform.user.impersonate", node: { level: "platform" } });
  if (decision.allowed) return ok(undefined);
  await deps.audit.record({
    log: "platform",
    action: "PLATFORM_ACCESS_DENIED",
    actor: auditActorOf(args.actor),
    target: args.targetUid === null ? { type: "platform", id: "impersonation" } : { type: "user", id: args.targetUid },
    ...(args.targetTenantId === null ? {} : { targetTenantId: args.targetTenantId }),
    outcome: "denied",
    requestId: args.requestId,
    metadata: { errorCode: decision.reason },
  });
  return err(new AccessDeniedError(decision.reason));
};
