import type { AccessPrincipal, AuditEntry, AuditPort } from "@core/agents";
import { AuditActionSchema, TenantIdSchema, UserIdSchema } from "@core/contracts";
import type { AuditWriter, TenantAuditRecordInput } from "@core/services";

/** Target of a tool audit when the entry names none: the tool itself. */
export const AGENT_TOOL_TARGET_TYPE = "agent-tool";

const actorOf = (principal: AccessPrincipal): TenantAuditRecordInput["actor"] => {
  if (principal.type === "service") return { type: "service", id: principal.apiKeyId };
  if (principal.type === "device") return { type: "device", id: principal.deviceId };
  const staffUid = principal.impersonation?.staffUid;
  return { type: "user", id: principal.uid, ...(staffUid === undefined ? {} : { onBehalfOf: UserIdSchema.parse(staffUid) }) };
};

const targetOf = (entry: AuditEntry): TenantAuditRecordInput["target"] => {
  if (entry.target !== undefined) return entry.target;
  const toolId = entry.metadata.toolId;
  return { type: AGENT_TOOL_TARGET_TYPE, id: typeof toolId === "string" && toolId !== "" ? toolId : entry.action.toLowerCase() };
};

/**
 * Maps SP3's `AuditPort` onto SP1's `AuditWriter.record` (SP1 report task-7-8).
 * SP1 entries carry no free metadata, so only the action, actor, target
 * (the tool when none is given), outcome and request id are kept; the input
 * hash, error code and fingerprint stay in the tool span. `denied` maps to
 * SP1's `denied`; every other outcome (succeeded, failed, pending approval) is
 * a `success` entry of an attempted action. An unregistered action or a
 * missing request id rejects, so the tool answers `AUDIT_UNAVAILABLE` (fail-closed).
 */
export const bindAuditPort = (writer: AuditWriter): AuditPort => ({
  record: async (entry) => {
    if (entry.requestId === undefined) throw new Error("AUDIT_REQUEST_ID_MISSING: agent audits need the request id");
    await writer.record({
      log: "tenant",
      tenantId: TenantIdSchema.parse(entry.tenantId),
      action: AuditActionSchema.parse(entry.action),
      actor: actorOf(entry.actor),
      target: targetOf(entry),
      outcome: entry.metadata.outcome === "denied" ? "denied" : "success",
      requestId: entry.requestId,
    });
  },
});
