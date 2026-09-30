/** The request does not exist or the caller may not see it → 404 NOT_FOUND. */
export class ApprovalNotFoundError extends Error {
  readonly code = "NOT_FOUND";

  constructor() {
    super("approval request not found");
    this.name = "ApprovalNotFoundError";
  }
}

/** The request is no longer pending (decided, expired, executed) → 409 CONFLICT. */
export class ApprovalNotPendingError extends Error {
  readonly code = "CONFLICT";

  constructor() {
    super("approval request is not pending");
    this.name = "ApprovalNotPendingError";
  }
}

/** No `ApprovalActionHandler` is registered for the action kind → 422 UNKNOWN_APPROVAL_ACTION. */
export class UnknownApprovalActionError extends Error {
  readonly code = "UNKNOWN_APPROVAL_ACTION";

  constructor() {
    super("unknown approval action kind");
    this.name = "UnknownApprovalActionError";
  }
}

/** The permission does not require approval → 422 APPROVAL_NOT_REQUIRED (the caller runs the action itself). */
export class ApprovalNotRequiredError extends Error {
  readonly code = "APPROVAL_NOT_REQUIRED";

  constructor() {
    super("the permission does not require approval");
    this.name = "ApprovalNotRequiredError";
  }
}

/** The handler's input schema refused `action.input` → 400 VALIDATION_FAILED with every issue. */
export class ApprovalInputInvalidError extends Error {
  readonly code = "VALIDATION_FAILED";
  readonly details: readonly { readonly field: string; readonly issue: string }[];

  constructor(details: readonly { readonly field: string; readonly issue: string }[]) {
    super("approval action input is invalid");
    this.name = "ApprovalInputInvalidError";
    this.details = details;
  }
}
