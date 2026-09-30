import type { Permission, Principal, TenantNodeRef, UserId } from "@core/contracts";
import { isAtOrBefore, type Clock } from "../../shared/clock/clock.ts";
import type { DenyReason } from "../domain/authorization.ts";
import { isNodeWithin, type NodeChain } from "../domain/node-chain.ts";
import type { AccessReaders } from "./ports/driven/access-readers.ts";
import type { ApiKeyStatusRecord } from "./ports/driven/principal-status-reader.ts";

/**
 * Whose grants decide, and what limits apply on top (SP1 spec §5.2 step 3):
 * a user or device uses its own grants; an API key uses its owner's grants
 * limited to its scopes; an impersonated user is limited to `read` permissions.
 */
export type TenantSubject = {
  readonly principalId: string;
  readonly scopes?: ReadonlySet<Permission> | undefined;
  readonly readOnly: boolean;
};

export type SubjectResult = { readonly ok: true; readonly subject: TenantSubject } | { readonly ok: false; readonly reason: DenyReason };

type SubjectArgs = { node: TenantNodeRef; chain: NodeChain; readers: AccessReaders; clock: Clock };

const denied = (reason: DenyReason): SubjectResult => ({ ok: false, reason });

// A missing profile counts as inactive (fail-closed); `GET /v1/me` creates it.
const isUserActive = async (readers: AccessReaders, uid: UserId): Promise<boolean> =>
  (await readers.principals.getUser(uid))?.status === "active";

const resolveUser = async (principal: Extract<Principal, { type: "user" }>, args: SubjectArgs): Promise<SubjectResult> => {
  if (!(await isUserActive(args.readers, principal.uid))) return denied("PRINCIPAL_INACTIVE");
  if (principal.impersonation === undefined) return { ok: true, subject: { principalId: principal.uid, readOnly: false } };
  const session = await args.readers.principals.getImpersonationSession(principal.impersonation.sessionId);
  // One reason for every unusable session: expired, ended, unknown, or issued for another user or tenant.
  const usable =
    session !== null &&
    session.endedAt === null &&
    !isAtOrBefore(session.expiresAt, args.clock.now()) &&
    session.targetUid === principal.uid &&
    session.staffUid === principal.impersonation.staffUid &&
    session.tenantId === args.node.tenantId;
  return usable ? { ok: true, subject: { principalId: principal.uid, readOnly: true } } : denied("IMPERSONATION_EXPIRED");
};

const resolveDevice = async (principal: Extract<Principal, { type: "device" }>, args: SubjectArgs): Promise<SubjectResult> => {
  const device = await args.readers.principals.getDevice(principal.deviceId);
  if (device?.status !== "active" || device.tenantId !== principal.tenantId) return denied("PRINCIPAL_INACTIVE");
  if (principal.tenantId !== args.node.tenantId) return denied("NOT_A_MEMBER");
  return { ok: true, subject: { principalId: principal.deviceId, readOnly: false } };
};

const matchesKey = (principal: Extract<Principal, { type: "service" }>, key: ApiKeyStatusRecord | null): key is ApiKeyStatusRecord =>
  key?.status === "active" && key.tenantId === principal.tenantId && key.ownerUid === principal.ownerUid;

const resolveService = async (principal: Extract<Principal, { type: "service" }>, args: SubjectArgs): Promise<SubjectResult> => {
  const key = await args.readers.principals.getApiKey(principal.apiKeyId);
  if (!matchesKey(principal, key)) return denied("PRINCIPAL_INACTIVE");
  if (isAtOrBefore(key.expiresAt, args.clock.now())) return denied("KEY_EXPIRED");
  if (!isNodeWithin({ inner: args.chain, outer: key.node })) return denied("OUTSIDE_KEY_SCOPE");
  if (!(await isUserActive(args.readers, key.ownerUid))) return denied("PRINCIPAL_INACTIVE");
  return { ok: true, subject: { principalId: key.ownerUid, scopes: new Set(key.scopes), readOnly: false } };
};

/** Resolves a principal to the subject whose grants apply at a tenant node. */
export const resolveTenantSubject = (principal: Principal, args: SubjectArgs): Promise<SubjectResult> => {
  switch (principal.type) {
    case "user":
      return resolveUser(principal, args);
    case "device":
      return resolveDevice(principal, args);
    case "service":
      return resolveService(principal, args);
  }
};
