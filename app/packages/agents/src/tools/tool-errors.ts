/**
 * Typed tool errors (spec §8.1, rules/error-handling.md). They reach the model
 * as tool errors with a stable `code` and a safe message; raw SDK, database or
 * port messages never do (they stay in `cause`, for the boundary log).
 */
export const CORE_TOOL_ERROR_CODES = [
  "TOOL_INPUT_INVALID",
  "CONTEXT_MISSING",
  "FORBIDDEN",
  "AUTHORIZATION_UNAVAILABLE",
  "APPROVAL_UNAVAILABLE",
  "AUDIT_UNAVAILABLE",
  "TOOL_TIMEOUT",
  "TOOL_ABORTED",
  "TOOL_OUTPUT_INVALID",
  "TOOL_FAILED",
  "TOOL_NOT_FOUND",
  "IDEMPOTENCY_UNAVAILABLE",
  "IDEMPOTENCY_KEY_REUSED",
  "COMMAND_IN_PROGRESS",
] as const;

export type CoreToolErrorCode = (typeof CORE_TOOL_ERROR_CODES)[number] | (string & {});

const SAFE_MESSAGES: Readonly<Record<string, string>> = {
  TOOL_INPUT_INVALID: "The tool input does not match its schema.",
  CONTEXT_MISSING: "The request context is incomplete; the tool did not run.",
  FORBIDDEN: "The caller is not allowed to use this tool here.",
  AUTHORIZATION_UNAVAILABLE: "Authorization could not be checked; the tool did not run.",
  APPROVAL_UNAVAILABLE: "The approval request could not be created; nothing was changed.",
  AUDIT_UNAVAILABLE: "The audit log is unavailable; the tool did not run.",
  TOOL_TIMEOUT: "The tool took too long and was stopped.",
  TOOL_ABORTED: "The run was cancelled before the tool finished.",
  TOOL_OUTPUT_INVALID: "The tool produced an invalid result.",
  TOOL_FAILED: "The tool failed.",
  TOOL_NOT_FOUND: "No tool is registered with this id.",
  IDEMPOTENCY_UNAVAILABLE: "The command could not be checked against earlier runs; nothing was changed.",
  IDEMPOTENCY_KEY_REUSED: "This tool call already ran with another input; nothing was changed.",
  COMMAND_IN_PROGRESS: "The same command is still running; try again shortly.",
};

export type CoreToolErrorDetails = Readonly<Record<string, string | number | boolean | readonly string[]>>;

/** Error a core tool reports to the model; `code` is SCREAMING_SNAKE and stable. */
export class CoreToolError extends Error {
  readonly code: CoreToolErrorCode;
  readonly toolId: string;
  readonly details: CoreToolErrorDetails;

  constructor(args: { code: CoreToolErrorCode; toolId: string; message?: string; details?: CoreToolErrorDetails }, options?: ErrorOptions) {
    super(args.message ?? SAFE_MESSAGES[args.code] ?? "The tool failed.", options);
    this.name = "CoreToolError";
    this.code = args.code;
    this.toolId = args.toolId;
    this.details = args.details ?? {};
  }
}

/** Domain-level failure a tool's `execute` may throw to give the model a specific, safe code. */
export const toolFailure = (toolId: string, code: string, message: string, details?: CoreToolErrorDetails): CoreToolError =>
  new CoreToolError({ code, toolId, message, ...(details === undefined ? {} : { details }) });

export const isCoreToolError = (error: unknown): error is CoreToolError => error instanceof CoreToolError;
