import type { AuditLogEntry, Principal } from "@core/contracts";

export type AuditActor = AuditLogEntry["actor"];

/** Actor id for automated writes (contracts/firebase-firestore.md §5). */
export const SYSTEM_ACTOR = "system";

/**
 * The audit `actor` of a principal: uid, device id or API key id; an impersonated user
 * carries the staff uid in `onBehalfOf` (SP1 spec §6.6).
 */
export const auditActorOf = (principal: Principal): AuditActor => {
  if (principal.type === "device") return { type: "device", id: principal.deviceId };
  if (principal.type === "service") return { type: "service", id: principal.apiKeyId };
  return principal.impersonation === undefined
    ? { type: "user", id: principal.uid }
    : { type: "user", id: principal.uid, onBehalfOf: principal.impersonation.staffUid };
};
