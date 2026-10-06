export type AuditEntryRejectedCode = "AUDIT_ENTRY_REJECTED" | "AUDIT_ENTRY_INVALID";

/**
 * Bug: a caller built an audit entry that must not be stored.
 * - `AUDIT_ENTRY_REJECTED`: it carries a key that holds personal data or a credential
 *   (email, token, secret, password…), which the log must never contain (SP1 spec §6.7).
 * - `AUDIT_ENTRY_INVALID`: it fails the `AuditLogEntry` contract.
 * Only key paths are kept, never values.
 */
export class AuditEntryRejectedError extends Error {
  readonly code: AuditEntryRejectedCode;
  readonly issuePaths: readonly string[];

  constructor(args: { code: AuditEntryRejectedCode; issuePaths: readonly string[] }) {
    super(`${args.code}: ${args.issuePaths.join(", ")}`);
    this.name = "AuditEntryRejectedError";
    this.code = args.code;
    this.issuePaths = args.issuePaths;
  }
}
