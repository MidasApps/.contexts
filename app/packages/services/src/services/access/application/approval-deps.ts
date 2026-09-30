import { PrincipalSchema, type ApprovalRequest, type Principal } from "@core/contracts";
import type { AuditWriter } from "../../audit/application/use-cases/record-audit.ts";
import type { Clock } from "../../shared/clock/clock.ts";
import type { UnitOfWork } from "../../shared/firestore/unit-of-work.ts";
import type { Logger } from "../../shared/observability/logger.ts";
import type { AccessCore } from "../composition.ts";
import type { ApprovalHandlerRegistry } from "./approval-handler-registry.ts";
import type { ApprovalRequestRepository } from "./ports/driven/approval-request-repository.ts";
import type { PrincipalStatusReader } from "./ports/driven/principal-status-reader.ts";

/** Dependencies of the four-eyes approval use cases (SP1 Task 17, SP1 spec §6.5). */
export type ApprovalDeps = {
  readonly approvals: ApprovalRequestRepository;
  readonly handlers: ApprovalHandlerRegistry;
  /** Fresh request scopes for in-process callers without one (SP3's agent runtime). */
  readonly accessCore: Pick<AccessCore, "forRequest">;
  /** Resolves an API key requester to its owner (four eyes, handler context). */
  readonly principals: Pick<PrincipalStatusReader, "getApiKey">;
  readonly audit: AuditWriter;
  readonly unitOfWork: UnitOfWork;
  readonly clock: Clock;
  readonly logger: Logger;
};

/** Who asked, as stored (`requestedBy`). */
export const requesterRefOf = (principal: Principal): ApprovalRequest["requestedBy"] => {
  if (principal.type === "user") return { type: "user", id: principal.uid };
  if (principal.type === "device") return { type: "device", id: principal.deviceId };
  return { type: "service", id: principal.apiKeyId };
};

/**
 * The requester as a principal: a user or device directly, an API key with its current owner
 * (null once the key is gone or belongs to another tenant). Parsed with the contract, never cast.
 */
export const resolveRequester = async (deps: Pick<ApprovalDeps, "principals">, request: ApprovalRequest): Promise<Principal | null> => {
  const { type, id } = request.requestedBy;
  const tenantId = request.tenantId;
  let candidate: unknown = null;
  if (type === "user") candidate = { type, uid: id, mfa: false };
  else if (type === "device") candidate = { type, deviceId: id, tenantId };
  else {
    const key = await deps.principals.getApiKey(id);
    candidate = key?.tenantId === tenantId ? { type, apiKeyId: id, tenantId, ownerUid: key.ownerUid } : null;
  }
  const parsed = PrincipalSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
};
