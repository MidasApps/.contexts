import { type Principal, type TenantId, type ToolApprovalDecision, ToolApprovalDecisionSchema, type ToolApprovalResponsePart } from "@core/contracts";
import { auditActorOf } from "../../../audit/domain/audit-actor.ts";
import type { AuditWriter } from "../../../audit/application/use-cases/record-audit.ts";

const APPROVAL_SEPARATOR = "::";
const TOOL_PREFIX = "tool-";

/**
 * The decision an approval response part carries (decision 0032): `approval.id` is
 * `<runId>::<toolCallId>` and must name the part's own tool call.
 * @returns `null` for a part whose approval id does not match its tool call (Mastra ignores it too).
 */
export const decisionOf = (conversationId: string, part: ToolApprovalResponsePart): ToolApprovalDecision | null => {
  const at = part.approval.id.lastIndexOf(APPROVAL_SEPARATOR);
  if (at <= 0 || part.approval.id.slice(at + APPROVAL_SEPARATOR.length) !== part.toolCallId) return null;
  const toolName = part.type === "dynamic-tool" ? (part.toolName ?? "dynamic-tool") : part.type.slice(TOOL_PREFIX.length);
  const parsed = ToolApprovalDecisionSchema.safeParse({
    conversationId,
    runId: part.approval.id.slice(0, at),
    toolCallId: part.toolCallId,
    toolName,
    approved: part.approval.approved,
    ...(part.approval.reason === undefined ? {} : { reason: part.approval.reason }),
  });
  return parsed.success ? parsed.data : null;
};

export type RecordToolDecisions = (input: {
  readonly principal: Principal;
  readonly tenantId: TenantId;
  readonly requestId: string;
  readonly decisions: readonly ToolApprovalDecision[];
}) => Promise<void>;

/**
 * Audits every inline approval decision before `/v1` forwards it to Mastra (decision 0032):
 * `AGENT_TOOL_CALL_APPROVED|DECLINED` with the conversation, run, tool call, tool and actor, and
 * the member's reason. The permission is not recorded here: `/v1` only has the client's copy of
 * the tool part; the tool pipeline audits the permission with `AGENT_TOOL_EXECUTED` when it runs.
 * @throws when the audit write fails (fail-closed: an unaudited decision is never forwarded).
 */
export const makeRecordToolDecisions =
  (deps: { readonly audit: AuditWriter }): RecordToolDecisions =>
  async ({ principal, tenantId, requestId, decisions }) => {
    for (const decision of decisions) {
      await deps.audit.record({
        log: "tenant",
        tenantId,
        action: decision.approved ? "AGENT_TOOL_CALL_APPROVED" : "AGENT_TOOL_CALL_DECLINED",
        actor: auditActorOf(principal),
        target: { type: "conversation", id: decision.conversationId },
        node: { level: "organization", tenantId },
        outcome: "success",
        requestId,
        ...(decision.reason === undefined ? {} : { reason: decision.reason }),
        metadata: { runId: decision.runId, toolCallId: decision.toolCallId, toolId: decision.toolName },
      });
    }
  };
