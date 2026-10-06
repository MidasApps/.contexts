/** One invalid variable: its name and Zod issue code, never its value. */
export type EnvIssue = { field: string; issue: string };

/** Boot-time failure: the process env does not satisfy the env schema. */
export class InvalidEnvError extends Error {
  readonly code = "INVALID_ENV";
  readonly issues: readonly EnvIssue[];

  constructor(issues: readonly EnvIssue[], options?: ErrorOptions) {
    // Names only: a value may be a secret (contracts/secrets.md §15).
    const fields = issues.map((entry) => `${entry.field} (${entry.issue})`).join(", ");
    super(`invalid environment: ${fields}`, options);
    this.name = "InvalidEnvError";
    this.issues = issues;
  }
}
