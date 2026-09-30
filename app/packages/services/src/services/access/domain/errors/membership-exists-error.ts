/** A live grant already exists for the principal at the node (one per tenant, principal, node) → 409 MEMBERSHIP_EXISTS. */
export class MembershipExistsError extends Error {
  readonly code = "MEMBERSHIP_EXISTS";
  readonly membershipId: string;

  constructor(membershipId: string, options?: ErrorOptions) {
    super("the principal already holds a grant at this node", options);
    this.name = "MembershipExistsError";
    this.membershipId = membershipId;
  }
}
