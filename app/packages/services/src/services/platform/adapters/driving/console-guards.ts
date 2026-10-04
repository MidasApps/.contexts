import type { Principal, TenantId } from "@core/contracts";
import type { Authorize } from "../../../access/application/ports/driving/authorize.ts";
import type { AuditWriter } from "../../../audit/application/use-cases/record-audit.ts";
import { auditActorOf } from "../../../audit/domain/audit-actor.ts";
import { authorizeOrganization } from "../../../knowledge/adapters/driving/knowledge-documents-route-handler.ts";
import { apiError } from "../../../shared/http/api-errors.ts";
import { tenantOfCall } from "../../../workflows/adapters/driving/workflow-call-scope.ts";

/** What the console guards read from a `/v1` handler context. */
export type GuardContext = {
  readonly principal: Principal;
  readonly authorize: Authorize;
  readonly audit: AuditWriter;
  readonly requestId: string;
};

/**
 * Every `/v1/admin/*` handler (SP5 spec §6, decision 0041): a `platform.*` permission at the
 * platform node, which SP1 grants only to active staff with MFA. An impersonated token is never
 * staff. A refusal answers 403 (`MFA_REQUIRED` for staff without MFA, else `FORBIDDEN`; the
 * platform node is not a secret, so non-staff get 403, not 404) and is audited on the platform
 * log as `PLATFORM_ACCESS_DENIED`.
 * @returns null when allowed, else the response to send.
 */
export const requireStaff = async (
  ctx: GuardContext,
  args: { readonly permission: string; readonly targetTenantId?: TenantId },
): Promise<Response | null> => {
  const impersonated = ctx.principal.type === "user" && ctx.principal.impersonation !== undefined;
  const decision = impersonated
    ? ({ allowed: false, reason: "IMPERSONATION_READ_ONLY" } as const)
    : await ctx.authorize({ principal: ctx.principal, permission: args.permission, node: { level: "platform" } });
  if (decision.allowed) return null;
  await ctx.audit.record({
    log: "platform",
    action: "PLATFORM_ACCESS_DENIED",
    actor: auditActorOf(ctx.principal),
    target: { type: "platform", id: args.permission },
    ...(args.targetTenantId === undefined ? {} : { targetTenantId: args.targetTenantId }),
    outcome: "denied",
    requestId: ctx.requestId,
    metadata: { errorCode: decision.reason },
  });
  return apiError(403, decision.reason === "MFA_REQUIRED" ? "MFA_REQUIRED" : "FORBIDDEN", ctx.requestId);
};

/**
 * Tenant console endpoints (`/v1/flags`, `/v1/agent-settings`, `/v1/traces`, ...): the
 * organization of the call (`?organizationId=` for users, an API key's own one) and the
 * permission there. Never a tenant id from the body.
 * @returns the organization, or the response to send.
 */
export const requireTenant = async (
  ctx: Omit<GuardContext, "audit">,
  args: { readonly organizationId: TenantId | undefined; readonly permission: string },
): Promise<TenantId | Response> => {
  const tenantId = tenantOfCall(ctx.principal, args.organizationId, ctx.requestId);
  if (tenantId instanceof Response) return tenantId;
  const denied = await authorizeOrganization({
    authorize: ctx.authorize,
    principal: ctx.principal,
    tenantId,
    permission: args.permission,
    requestId: ctx.requestId,
  });
  return denied ?? tenantId;
};
