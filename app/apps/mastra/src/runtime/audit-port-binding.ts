import type { AccessPrincipal, AuditEntry, AuditPort } from "@core/agents";
import { AuditActionSchema, type AuditMetadata, AuditMetadataSchema, type AuditOutcome, TenantIdSchema, UserIdSchema } from "@core/contracts";
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

// The tool pipeline's outcomes (decision 0025) onto SP1's `AuditOutcome`.
const OUTCOMES: Readonly<Record<string, AuditOutcome>> = {
  succeeded: "success",
  denied: "denied",
  failed: "failed",
  "pending-approval": "pending-approval",
};

// The pipeline writes digests as `sha256:<hex>`; SP1 stores the bare hex digest.
const digestOf = (value: unknown): unknown => (typeof value === "string" ? value.replace(/^sha256:/, "") : value);

/**
 * SP1's allowlisted metadata (`AuditMetadataSchema`): each known key is kept only when its
 * value passes the SP1 rule, so a malformed value is dropped instead of failing the audit;
 * every other key (agent id, permission, reason, approval id, counts) stays in the tool span.
 */
export const auditMetadataOf = (metadata: AuditEntry["metadata"]): AuditMetadata | undefined => {
  const candidates: Record<string, unknown> = {
    inputHash: digestOf(metadata.inputHash),
    fingerprint: digestOf(metadata.fingerprint),
    errorCode: metadata.errorCode,
    toolId: metadata.toolId,
    runId: metadata.runId,
    durationMs: metadata.durationMs,
  };
  const kept = Object.fromEntries(
    Object.entries(candidates).filter(([key, value]) => value !== undefined && value !== null && AuditMetadataSchema.shape[key as keyof AuditMetadata].safeParse(value).success),
  );
  return Object.keys(kept).length === 0 ? undefined : AuditMetadataSchema.parse(kept);
};

/**
 * Maps SP3's `AuditPort` onto SP1's `AuditWriter.record` (SP1 commit 4a3a282): the
 * pipeline outcome becomes SP1's `success | denied | failed | pending-approval`
 * (an unknown one is `failed`, never `success`), and the allowlisted machine facts
 * (input hash, fingerprint, error code, tool id, run id, duration) become `metadata`.
 * An unregistered action or a missing request id rejects, so the tool answers
 * `AUDIT_UNAVAILABLE` (fail-closed).
 */
export const bindAuditPort = (writer: AuditWriter): AuditPort => ({
  record: async (entry) => {
    if (entry.requestId === undefined) throw new Error("AUDIT_REQUEST_ID_MISSING: agent audits need the request id");
    const outcome = typeof entry.metadata.outcome === "string" ? (OUTCOMES[entry.metadata.outcome] ?? "failed") : "failed";
    const metadata = auditMetadataOf(entry.metadata);
    await writer.record({
      log: "tenant",
      tenantId: TenantIdSchema.parse(entry.tenantId),
      action: AuditActionSchema.parse(entry.action),
      actor: actorOf(entry.actor),
      target: targetOf(entry),
      outcome,
      ...(metadata === undefined ? {} : { metadata }),
      requestId: entry.requestId,
    });
  },
});
