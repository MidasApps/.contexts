import type { z } from "zod";
import type { EnvIssue } from "./invalid-env-error.ts";

/** Zod issues → env issues: the variable path and issue code, never the value. */
export const toEnvIssues = (error: z.ZodError): EnvIssue[] =>
  error.issues.map((issue) => ({ field: issue.path.map(String).join("."), issue: issue.code.toUpperCase() }));
