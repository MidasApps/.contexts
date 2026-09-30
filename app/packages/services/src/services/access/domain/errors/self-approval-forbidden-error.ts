/** Four eyes (SP1 spec §6.5): the requester (or the owner of the requesting API key) cannot decide → 403. */
export class SelfApprovalForbiddenError extends Error {
  readonly code = "SELF_APPROVAL_FORBIDDEN";

  constructor() {
    super("the requester cannot decide their own approval request");
    this.name = "SelfApprovalForbiddenError";
  }
}
