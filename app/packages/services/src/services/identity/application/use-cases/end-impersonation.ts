import type { ImpersonationSession, ImpersonationSessionId, UserPrincipal } from "@core/contracts";
import type { Transaction } from "firebase-admin/firestore";
import type { RequestAccess } from "../../../access/composition.ts";
import type { AccessDeniedError } from "../../../access/domain/errors/access-denied-error.ts";
import { err, ok, type Result } from "../../../shared/result/result.ts";
import { ImpersonationNotFoundError } from "../../domain/errors/impersonation-errors.ts";
import type { PlatformDeps } from "../platform-deps.ts";
import { requireImpersonateRight } from "../platform-guard.ts";

export type EndImpersonation = (command: {
  actor: UserPrincipal;
  access: RequestAccess;
  sessionId: ImpersonationSessionId;
  requestId: string;
}) => Promise<Result<void, AccessDeniedError | ImpersonationNotFoundError>>;

/** Both audit entries of an ended impersonation session (platform and tenant logs). */
export const auditEnd = async (tx: Transaction, deps: Pick<PlatformDeps, "audit">, session: ImpersonationSession, requestId: string): Promise<void> => {
  const common = { action: "IMPERSONATION_ENDED", outcome: "success", requestId } as const;
  await deps.audit.record(
    { log: "platform", ...common, actor: { type: "user", id: session.staffUid }, target: { type: "user", id: session.targetUid }, targetTenantId: session.tenantId },
    tx,
  );
  await deps.audit.record(
    {
      log: "tenant",
      ...common,
      tenantId: session.tenantId,
      actor: { type: "user", id: session.targetUid, onBehalfOf: session.staffUid },
      target: { type: "impersonation-session", id: session.id },
      node: { level: "organization", tenantId: session.tenantId },
    },
    tx,
  );
};

/**
 * `POST /v1/platform/impersonation-sessions/{sessionId}/end` → 204 (SP1 spec §6.6): the staff
 * member ends their own session early (`platform.user.impersonate` with MFA). Idempotent: an
 * ended session answers ok without a second audit entry; someone else's session is 404.
 */
export const makeEndImpersonation =
  (deps: PlatformDeps): EndImpersonation =>
  async ({ actor, access, sessionId, requestId }) => {
    const allowed = await requireImpersonateRight(deps, { actor, access, targetUid: null, targetTenantId: null, requestId });
    if (!allowed.ok) return allowed;
    return deps.unitOfWork.run(async (tx): Promise<Result<void, ImpersonationNotFoundError>> => {
      const session = await deps.impersonations.get(tx, sessionId);
      if (session?.staffUid !== actor.uid) return err(new ImpersonationNotFoundError());
      if (session.endedAt !== null) return ok(undefined);
      deps.impersonations.end(tx, { id: session.id, endedAt: deps.clock.now().toISOString(), actorId: actor.uid });
      await auditEnd(tx, deps, session, requestId);
      return ok(undefined);
    });
  };
