import type { AuditOutcome, UserPrincipal } from "@core/contracts";
import type { DenyReason } from "#/services/access/domain/authorization.ts";
import { auditActorOf } from "#/services/audit/domain/audit-actor.ts";
import type { PlatformDeps } from "../platform-deps.ts";

/** A `/v1` request served to an impersonated principal (the pipeline reports each one). */
export type ImpersonatedRequest = {
  readonly principal: UserPrincipal & { readonly impersonation: NonNullable<UserPrincipal["impersonation"]> };
  readonly endpointId: string;
  readonly method: string;
  readonly status: number;
  /** The last `authorize()` denial of the request, when it answered with an error. */
  readonly denyReason?: DenyReason | undefined;
  readonly requestId: string;
};

export type AuditImpersonatedRequest = (request: ImpersonatedRequest) => Promise<void>;

const READ_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD"]);

const outcomeOf = (status: number): AuditOutcome => (status < 400 ? "success" : status >= 500 ? "failed" : "denied");

/**
 * Audits one impersonated request in the platform log and in the tenant log of the
 * session's organization (SP1 spec §6.6), `actor.onBehalfOf = staffUid`: a refused write is
 * `IMPERSONATED_WRITE_DENIED`, anything else `IMPERSONATED_REQUEST_SERVED`, with the endpoint
 * id and the deny reason as metadata. An unknown session has no tenant: platform log only.
 * @throws when the audit write fails (the request then answers 500: never unaudited).
 */
export const makeAuditImpersonatedRequest =
  (deps: Pick<PlatformDeps, "impersonations" | "audit" | "unitOfWork" | "logger">): AuditImpersonatedRequest =>
  async (request) => {
    const session = await deps.impersonations.get(undefined, request.principal.impersonation.sessionId);
    const deniedWrite = !READ_METHODS.has(request.method.toUpperCase()) && request.status === 403;
    const entry = {
      action: deniedWrite ? "IMPERSONATED_WRITE_DENIED" : "IMPERSONATED_REQUEST_SERVED",
      actor: auditActorOf(request.principal),
      target: { type: "impersonation-session", id: request.principal.impersonation.sessionId },
      outcome: outcomeOf(request.status),
      requestId: request.requestId,
      metadata: {
        endpointId: request.endpointId,
        ...(request.denyReason === undefined ? {} : { errorCode: request.denyReason }),
      },
    } as const;
    await deps.unitOfWork.run(async (tx) => {
      await deps.audit.record(
        { log: "platform", ...entry, ...(session === null ? {} : { targetTenantId: session.tenantId }) },
        tx,
      );
      if (session !== null) await deps.audit.record({ log: "tenant", ...entry, tenantId: session.tenantId }, tx);
    });
    deps.logger.info("impersonated_request", {
      requestId: request.requestId,
      endpointId: request.endpointId,
      status: request.status,
      reason: request.denyReason ?? null,
    });
  };
