import type { z } from "zod";

/** An i18n key (full path) plus its ICU values. */
export type MessageDescriptor = { readonly key: string; readonly values?: Record<string, number | string> };

const ERRORS = "common.form.errors";

type SizeIssue = { origin?: string; minimum?: number | bigint; maximum?: number | bigint };

const asNumber = (value: number | bigint | undefined): number => Number(value ?? 0);

const isEmpty = (input: unknown): boolean => input === undefined || input === null || input === "";

const tooSmall = (issue: SizeIssue): MessageDescriptor => {
  if (issue.origin === "string" && asNumber(issue.minimum) <= 1) return { key: `${ERRORS}.required` };
  if (issue.origin === "string") return { key: `${ERRORS}.tooShort`, values: { minimum: asNumber(issue.minimum) } };
  if (issue.origin === "number") return { key: `${ERRORS}.tooSmall`, values: { minimum: asNumber(issue.minimum) } };
  return { key: `${ERRORS}.invalid` };
};

const tooBig = (issue: SizeIssue): MessageDescriptor => {
  if (issue.origin === "string") return { key: `${ERRORS}.tooLong`, values: { maximum: asNumber(issue.maximum) } };
  if (issue.origin === "number") return { key: `${ERRORS}.tooBig`, values: { maximum: asNumber(issue.maximum) } };
  return { key: `${ERRORS}.invalid` };
};

/**
 * Copy for a client-side Zod issue (SchemaForm validates with the contract schema). Contract
 * schemas may carry English `error` strings for developers; the UI never shows them, it maps the
 * issue code and its limits to `common.form.errors.*` instead. `value` is the field's current
 * input (Zod does not report inputs by default): an empty field reads "required".
 */
export const describeZodIssue = (issue: z.core.$ZodIssue, value: unknown): MessageDescriptor => {
  if ((issue.code === "invalid_type" || issue.code === "invalid_value") && issue.path.length <= 1 && isEmpty(value)) {
    return { key: `${ERRORS}.required` };
  }
  if (issue.code === "invalid_type") {
    return { key: issue.expected === "int" ? `${ERRORS}.notInteger` : `${ERRORS}.invalid` };
  }
  if (issue.code === "too_small") return tooSmall(issue);
  if (issue.code === "too_big") return tooBig(issue);
  if (issue.code === "invalid_format") return { key: issue.format === "safeint" ? `${ERRORS}.notInteger` : `${ERRORS}.invalidFormat` };
  if (issue.code === "invalid_value") return { key: `${ERRORS}.invalidOption` };
  return { key: `${ERRORS}.invalid` };
};

const SERVER_ISSUES: Record<string, string> = {
  INVALID_FORMAT: `${ERRORS}.invalidFormat`,
  INVALID_VALUE: `${ERRORS}.invalidOption`,
};

/**
 * Copy for a server `VALIDATION_FAILED` detail (`issue` is the upper-cased Zod code, rule
 * `validation`); limits are not sent, so size issues fall back to the generic message.
 */
export const describeServerIssue = (issue: string): MessageDescriptor => ({ key: SERVER_ISSUES[issue] ?? `${ERRORS}.invalid` });
