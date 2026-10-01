import type { FieldError, FieldErrors, FieldValues, Resolver } from "react-hook-form";
import type { z } from "zod";

/** Errors a widget found before the schema could see the value (unparseable money text). */
export type PendingFieldErrors = ReadonlyMap<string, string>;

/** Copy for an issue, given the current input of its top-level field. */
type Translate = (issue: z.core.$ZodIssue, value: unknown) => string;

/** RHF name of an issue: its top-level field, or `root` for object-level refinements. */
const issueName = (issue: z.core.$ZodIssue): string => (issue.path.length === 0 ? "root" : String(issue.path[0]));

const collectErrors = (issues: readonly z.core.$ZodIssue[], values: FieldValues, translate: Translate): Record<string, FieldError> => {
  const errors: Record<string, FieldError> = {};
  for (const issue of issues) {
    const name = issueName(issue);
    errors[name] ??= { type: issue.code, message: translate(issue, values[name]) };
  }
  return errors;
};

/**
 * RHF resolver over the contract schema itself (rule `validation`: one schema, `safeParse`),
 * with translated messages. `@hookform/resolvers/zod` is not used because it keeps the schema's
 * own (English, developer-facing) messages and drops the issue limits the copy needs.
 */
export const createContractResolver =
  <Values extends FieldValues>(schema: z.ZodType, translate: Translate, pending: () => PendingFieldErrors): Resolver<Values> =>
  async (values) => {
    const result = await schema.safeParseAsync(values);
    const errors = result.success ? {} : collectErrors(result.error.issues, values, translate);
    for (const [name, message] of pending()) errors[name] = { type: "parse", message };
    if (Object.keys(errors).length === 0 && result.success) return { values: result.data as Values, errors: {} };
    return { values: {}, errors: errors as FieldErrors<Values> };
  };
