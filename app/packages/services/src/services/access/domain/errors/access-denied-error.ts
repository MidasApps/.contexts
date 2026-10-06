import type { DenyReason } from "../authorization.ts";

/** `authorize()` denied the action; the route answers `deniedResponse(reason)` (404 or 403). */
export class AccessDeniedError extends Error {
  readonly code = "ACCESS_DENIED";
  readonly reason: DenyReason;

  constructor(reason: DenyReason, options?: ErrorOptions) {
    super(`access denied: ${reason}`, options);
    this.name = "AccessDeniedError";
    this.reason = reason;
  }
}
