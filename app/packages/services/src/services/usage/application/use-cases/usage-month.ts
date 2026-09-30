/** First instant of the UTC month of `at`: months of the ledger are UTC calendar months. */
export const utcMonthStart = (at: Date): Date => new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));

/** `YYYY-MM` of a month start. */
export const monthKeyOf = (monthStart: Date): string => monthStart.toISOString().slice(0, 7);

/** Month start of a `YYYY-MM` key (already validated by the caller's schema). */
export const monthStartOfKey = (key: string): Date => new Date(`${key}-01T00:00:00.000Z`);

/** Contract-style `VALIDATION_FAILED` details from Zod issues (never the raw `ZodError`). */
export const validationDetailsOf = (issues: readonly { readonly path: readonly PropertyKey[]; readonly code: string }[]) =>
  issues.map((issue) => ({ field: issue.path.map(String).join("."), issue: issue.code.toUpperCase() }));
