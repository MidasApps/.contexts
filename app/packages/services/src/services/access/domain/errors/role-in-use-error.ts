/** Deleting a custom role that a live grant still uses (SP1 spec §5.3) → 409 ROLE_IN_USE. */
export class RoleInUseError extends Error {
  readonly code = "ROLE_IN_USE";
  readonly roleId: string;

  constructor(roleId: string, options?: ErrorOptions) {
    super("the role is used by at least one grant", options);
    this.name = "RoleInUseError";
    this.roleId = roleId;
  }
}
