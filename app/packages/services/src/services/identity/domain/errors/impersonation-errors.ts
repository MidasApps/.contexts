/** The impersonation session does not exist or belongs to another staff member (404, existence not revealed). */
export class ImpersonationNotFoundError extends Error {
  readonly code = "NOT_FOUND";

  constructor() {
    super("impersonation session not found");
    this.name = "ImpersonationNotFoundError";
  }
}
