import { z } from "zod";

/**
 * Every error code the core's `/v1` answers with (SP1 spec §7.2, §7.3; decision 0009).
 * Clients program against these, and SP2 uses them as i18n keys (`errors.<CODE>`).
 */
export const CORE_ERROR_CODES = [
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_FAILED",
  "CONFLICT",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
  "IDEMPOTENCY_KEY_REUSED",
  "IDEMPOTENCY_REQUEST_IN_PROGRESS",
  "LAST_OWNER",
  "ROLE_IN_USE",
  "ESCALATION_FORBIDDEN",
  "EMAIL_MISMATCH",
  "INVITATION_EXPIRED",
  "INVITATION_ALREADY_USED",
  "INVALID_UNIT_PARENT",
  "SUBTREE_TOO_LARGE",
  "UNKNOWN_PERMISSION",
  "SELF_APPROVAL_FORBIDDEN",
  "MFA_REQUIRED",
  "MEMBERSHIP_EXISTS",
  "UNKNOWN_APPROVAL_ACTION",
  "APPROVAL_NOT_REQUIRED",
  // 502/503: a service the core calls (Mastra, a model provider) did not answer.
  "UPSTREAM_UNAVAILABLE",
  // 503: a feature switched off for the platform or not configured (SP4 voice, decision 0034).
  "FEATURE_UNAVAILABLE",
] as const;

export const CoreErrorCodeSchema = z.enum(CORE_ERROR_CODES);
export type CoreErrorCode = z.infer<typeof CoreErrorCodeSchema>;
