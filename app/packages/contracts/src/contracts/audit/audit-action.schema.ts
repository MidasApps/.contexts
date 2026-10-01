import { z } from "zod";

/**
 * Audited actions (SP1 spec §6.7): SCREAMING_SNAKE, past tense, a consumed fact
 * (contracts/events.md §3.1). Denied platform and impersonation attempts use
 * `outcome: "denied"` on the `*_DENIED` actions.
 */
export const AUDIT_ACTIONS = [
  "ORGANIZATION_CREATED",
  "ORGANIZATION_UPDATED",
  "ORGANIZATION_DELETED",
  "PROJECT_CREATED",
  "PROJECT_UPDATED",
  "PROJECT_DELETED",
  "UNIT_CREATED",
  "UNIT_UPDATED",
  "UNIT_MOVED",
  "UNIT_DELETED",
  "MODULE_SETTINGS_UPDATED",
  "ROLE_CREATED",
  "ROLE_UPDATED",
  "ROLE_DELETED",
  "MEMBERSHIP_GRANTED",
  "MEMBERSHIP_UPDATED",
  "MEMBERSHIP_REVOKED",
  "MEMBER_REMOVED",
  "INVITATION_CREATED",
  "INVITATION_ACCEPTED",
  "INVITATION_REVOKED",
  "API_KEY_CREATED",
  "API_KEY_REVOKED",
  "DEVICE_ACTIVATION_CREATED",
  "DEVICE_ACTIVATED",
  "DEVICE_REVOKED",
  "ACTIVE_ORGANIZATION_CHANGED",
  "SESSION_REVOKED",
  "ALL_SESSIONS_REVOKED",
  "DESKTOP_SESSION_REUSE_DETECTED",
  "IMPERSONATION_STARTED",
  "IMPERSONATION_ENDED",
  "IMPERSONATED_REQUEST_SERVED",
  "IMPERSONATED_WRITE_DENIED",
  "APPROVAL_REQUESTED",
  "APPROVAL_APPROVED",
  "APPROVAL_REJECTED",
  "APPROVAL_EXECUTED",
  "APPROVAL_FAILED",
  // SP5 Task 7: the approval-expiry-sweep stored `expired` on an overdue pending request.
  "APPROVAL_EXPIRED",
  "PLATFORM_STAFF_GRANTED",
  "PLATFORM_ACCESS_DENIED",
  // Agent runtime (SP3 spec §8.1, §8.3, §11): SP3 adds action names only, the writer stays SP1's.
  "AGENT_TOOL_EXECUTED",
  "SEMANTIC_QUERY_EXECUTED",
  "KNOWLEDGE_DOCUMENT_INDEXED",
  "KNOWLEDGE_DOCUMENT_INGESTED",
  "KNOWLEDGE_DOCUMENT_DELETED",
  // Uploads (SP3 files context): an accepted object, or one refused by the magic-bytes check.
  "FILE_UPLOADED",
  "FILE_REJECTED",
  // Tenant connectors (SP3 connectors context): the secret itself is never audited.
  "CONNECTOR_CREATED",
  "CONNECTOR_UPDATED",
  "CONNECTOR_DELETED",
  "CONNECTOR_SECRET_SET",
  // Chat (SP4 spec §4.1, §4.4, §4.5): approval decisions, conversation deletes and voice calls.
  "AGENT_TOOL_CALL_APPROVED",
  "AGENT_TOOL_CALL_DECLINED",
  "CONVERSATION_DELETED",
  "VOICE_TRANSCRIBED",
  "VOICE_SYNTHESIZED",
  // SP5 workflows: a tenant reached 80 % or 100 % of a monthly budget cap (decision 0039).
  "BUDGET_THRESHOLD_REACHED",
  // SP5 console: a flag value or tenant override changed (decision 0039).
  "FEATURE_FLAG_UPDATED",
  // SP5 console: plans, an organization's plan or budget override, agent settings (decision 0039).
  "PLAN_CREATED",
  "PLAN_UPDATED",
  "TENANT_BUDGET_UPDATED",
  "AGENT_SETTINGS_UPDATED",
  // SP5 prompt store (decision 0038): versions, eval verdicts, activations (forced ones apart).
  "PROMPT_VERSION_CREATED",
  "PROMPT_EVALUATED",
  "PROMPT_ACTIVATED",
  "PROMPT_ACTIVATION_FORCED",
] as const;

export const AuditActionSchema = z.enum(AUDIT_ACTIONS);
export type AuditAction = z.infer<typeof AuditActionSchema>;
