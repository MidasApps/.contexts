import type {
  ImpersonationSession,
  StartImpersonationInput,
  StartImpersonationResponse,
  UserPrincipal,
} from "@core/contracts";
import type { RequestAccess } from "#/services/access/composition.ts";
import { AccessDeniedError } from "#/services/access/domain/errors/access-denied-error.ts";
import { AccessNotFoundError } from "#/services/access/domain/errors/access-not-found-error.ts";
import { err, ok, type Result } from "#/services/shared/result/result.ts";
import type { PlatformDeps } from "../platform-deps.ts";
import { requireImpersonateRight } from "../platform-guard.ts";

export type StartImpersonationCommand = {
  readonly actor: UserPrincipal;
  readonly access: RequestAccess;
  readonly input: StartImpersonationInput;
  readonly requestId: string;
};

export type StartImpersonation = (
  command: StartImpersonationCommand,
) => Promise<Result<StartImpersonationResponse, AccessDeniedError | AccessNotFoundError>>;

const MINUTE_MS = 60_000;

// The target must be able to read the organization now: staff never gets a view the user lacks.
const targetIsMember = async (command: StartImpersonationCommand): Promise<boolean> => {
  const target: UserPrincipal = { type: "user", uid: command.input.targetUid, mfa: false };
  const node = { level: "organization", tenantId: command.input.organizationId } as const;
  return (await command.access.authorize({ principal: target, permission: "core.organization.read", node })).allowed;
};

const record = async (deps: PlatformDeps, session: ImpersonationSession, requestId: string): Promise<void> => {
  const common = { action: "IMPERSONATION_STARTED", outcome: "success", requestId, reason: session.reason } as const;
  await deps.unitOfWork.run(async (tx) => {
    deps.impersonations.create(tx, { session, actorId: session.staffUid });
    await deps.audit.record(
      {
        log: "platform",
        ...common,
        actor: { type: "user", id: session.staffUid },
        target: { type: "user", id: session.targetUid },
        targetTenantId: session.tenantId,
      },
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
  });
};

/**
 * `POST /v1/platform/impersonation-sessions` (SP1 spec §6.6): staff with
 * `platform.user.impersonate` and MFA opens a read-only session of at most 60 minutes on a
 * member of the organization, audited on both logs. The custom token carries `imp` (session
 * id) and `impBy` (staff uid); `authorize()` checks the session doc on every request, so
 * ending or expiring the session stops the token even before it expires.
 */
export const makeStartImpersonation =
  (deps: PlatformDeps): StartImpersonation =>
  async (command) => {
    const { actor, input } = command;
    const allowed = await requireImpersonateRight(deps, {
      ...command,
      targetUid: input.targetUid,
      targetTenantId: input.organizationId,
    });
    if (!allowed.ok) return allowed;
    if (input.targetUid === actor.uid) return err(new AccessDeniedError("PERMISSION_NOT_GRANTED"));
    if (!(await targetIsMember(command))) return err(new AccessNotFoundError("user"));
    const now = deps.clock.now();
    const session: ImpersonationSession = {
      id: deps.impersonations.newId(),
      staffUid: actor.uid,
      targetUid: input.targetUid,
      tenantId: input.organizationId,
      reason: input.reason,
      expiresAt: new Date(now.getTime() + input.durationMinutes * MINUTE_MS).toISOString(),
      endedAt: null,
      createdAt: now.toISOString(),
    };
    await record(deps, session, command.requestId);
    const customToken = await deps.customTokens.createCustomToken(session.targetUid, {
      imp: session.id,
      impBy: session.staffUid,
    });
    return ok({ sessionId: session.id, customToken, expiresAt: session.expiresAt });
  };
