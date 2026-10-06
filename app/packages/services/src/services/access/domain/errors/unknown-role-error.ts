/**
 * A grant names a custom role that does not exist, was deleted or belongs to another
 * organization. The wire mapping belongs to the membership routes (SP1 Task 11).
 */
export class UnknownRoleError extends Error {
  readonly code = "UNKNOWN_ROLE";
  readonly roleIds: readonly string[];

  constructor(roleIds: readonly string[], options?: ErrorOptions) {
    super(`unknown custom roles: ${roleIds.join(", ")}`, options);
    this.name = "UnknownRoleError";
    this.roleIds = roleIds;
  }
}
