/** A failed submit, in the `/v1` error envelope's terms (`ApiError` fits it structurally). */
export type SchemaFormFailure = {
  readonly code: string;
  readonly details?: readonly { readonly field: string; readonly issue: string }[] | undefined;
  readonly requestId?: string | undefined;
};

/** What `onSubmit` resolves to: SchemaForm shows success, field errors or a form error. */
export type SchemaFormResult = { readonly ok: true } | { readonly ok: false; readonly error: SchemaFormFailure };

export type FieldIssue = { readonly name: string; readonly issue: string };

export type MappedServerErrors = {
  /** One issue per rendered top-level field, in `details` order. */
  readonly fieldIssues: readonly FieldIssue[];
  /** Whether the failure also needs the form-level alert (other codes, or fields not on screen). */
  readonly showFormError: boolean;
};

/** Top-level field of a dotted path: `budget.amountMinor` → `budget`, `items[0].sku` → `items`. */
const topLevelName = (field: string): string => field.split(/[.[]/u, 1)[0] ?? field;

/**
 * Maps `VALIDATION_FAILED.details[].field` back to the form's fields (SP2 spec §3.1). Details for
 * fields that are not rendered, and every other error code, surface in the form-level alert.
 */
export const mapServerErrors = (failure: SchemaFormFailure, rendered: ReadonlySet<string>): MappedServerErrors => {
  if (failure.code !== "VALIDATION_FAILED" || failure.details === undefined || failure.details.length === 0) {
    return { fieldIssues: [], showFormError: true };
  }
  const fieldIssues: FieldIssue[] = [];
  let unmatched = false;
  for (const detail of failure.details) {
    const name = topLevelName(detail.field);
    if (!rendered.has(name)) unmatched = true;
    else if (!fieldIssues.some((known) => known.name === name)) fieldIssues.push({ name, issue: detail.issue });
  }
  return { fieldIssues, showFormError: unmatched || fieldIssues.length === 0 };
};

const readString = (value: unknown, key: string): string | undefined => {
  if (typeof value !== "object" || value === null || !(key in value)) return undefined;
  const found = (value as Record<string, unknown>)[key];
  return typeof found === "string" ? found : undefined;
};

/** A thrown `onSubmit` (e.g. an `ApiError`) becomes a failure; anything else is `INTERNAL_ERROR`. */
export const toSchemaFormFailure = (thrown: unknown): SchemaFormFailure => ({
  code: readString(thrown, "code") ?? "INTERNAL_ERROR",
  requestId: readString(thrown, "requestId"),
});
