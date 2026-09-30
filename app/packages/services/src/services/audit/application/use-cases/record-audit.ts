import {
  AuditLogEntrySchema,
  PlatformAuditLogEntrySchema,
  type AuditLogEntry,
  type AuditLogEntryId,
  type PlatformAuditLogEntry,
} from "@core/contracts";
import type { z } from "zod";
import type { Clock } from "../../../shared/clock/clock.ts";
import { AuditEntryRejectedError } from "../../domain/audit-entry-rejected-error.ts";
import { findForbiddenAuditKeys } from "../../domain/forbidden-audit-keys.ts";
import type { AuditLogAppend, AuditLogWriter, AuditTransaction } from "../ports/driven/audit-log-writer.ts";

/** A tenant entry; `occurredAt` defaults to the clock. */
export type TenantAuditRecordInput = Omit<AuditLogEntry, "id" | "occurredAt"> & { readonly log: "tenant"; readonly occurredAt?: string };

/** A platform (staff) entry; `occurredAt` defaults to the clock. */
export type PlatformAuditRecordInput = Omit<PlatformAuditLogEntry, "id" | "occurredAt"> & {
  readonly log: "platform";
  readonly occurredAt?: string;
};

export type AuditRecordInput = TenantAuditRecordInput | PlatformAuditRecordInput;

/** Driving port of the audit context (SP1 spec §6.7). */
export type AuditWriter = {
  /**
   * Validates and appends one entry, inside `tx` when the action has a business transaction.
   * @throws {AuditEntryRejectedError} for a forbidden key (email, token, secret…) or a contract failure.
   */
  readonly record: (input: AuditRecordInput, tx?: AuditTransaction) => Promise<AuditLogEntryId>;
};

const TenantEntrySchema = AuditLogEntrySchema.omit({ id: true });
const PlatformEntrySchema = PlatformAuditLogEntrySchema.omit({ id: true });

const issuePathsOf = (error: z.ZodError): string[] => [
  ...new Set(error.issues.map((issue) => (issue.path.length === 0 ? "(root)" : issue.path.map(String).join(".")))),
];

const invalid = (error: z.ZodError): AuditEntryRejectedError =>
  new AuditEntryRejectedError({ code: "AUDIT_ENTRY_INVALID", issuePaths: issuePathsOf(error) });

// Parsing strips unknown keys; forbidden ones were rejected before.
const toAppend = (input: AuditRecordInput, occurredAt: string): AuditLogAppend => {
  const { log, ...fields } = input;
  const candidate = { ...fields, occurredAt: input.occurredAt ?? occurredAt };
  if (log === "tenant") {
    const parsed = TenantEntrySchema.safeParse(candidate);
    if (!parsed.success) throw invalid(parsed.error);
    return { log, entry: parsed.data };
  }
  const parsed = PlatformEntrySchema.safeParse(candidate);
  if (!parsed.success) throw invalid(parsed.error);
  return { log, entry: parsed.data };
};

/** Builds the `AuditWriter` use case over a log writer adapter. */
export const makeRecordAudit = (deps: { writer: AuditLogWriter; clock: Clock }): AuditWriter => ({
  record: async (input, tx) => {
    const forbidden = findForbiddenAuditKeys(input);
    if (forbidden.length > 0) throw new AuditEntryRejectedError({ code: "AUDIT_ENTRY_REJECTED", issuePaths: forbidden });
    const append = toAppend(input, deps.clock.now().toISOString());
    return tx === undefined ? deps.writer.append(append) : deps.writer.append(append, tx);
  },
});
