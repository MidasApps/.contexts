export type AgentCommandErrorCode =
  | "IDEMPOTENCY_KEY_REUSED"
  | "COMMAND_IN_PROGRESS"
  | "REQUESTER_UNAVAILABLE"
  | "REQUESTER_MISMATCH"
  | "REQUESTER_FORBIDDEN"
  | "TENANT_MISMATCH"
  | "PERMISSION_MISMATCH"
  | "UNKNOWN_COMMAND"
  | "COMMAND_INPUT_INVALID"
  | "COMMAND_REFUSED";

/**
 * Why an agent command did not run (decision 0025). The SP1 approval flow audits `code` as
 * the `errorCode` of `APPROVAL_FAILED`; the agent tool pipeline maps it to a tool failure.
 */
export class AgentCommandError extends Error {
  readonly code: AgentCommandErrorCode;
  readonly commandId: string;

  constructor(code: AgentCommandErrorCode, commandId: string, options?: ErrorOptions) {
    super(`${code}: ${commandId}`, options);
    this.name = "AgentCommandError";
    this.code = code;
    this.commandId = commandId;
  }
}
