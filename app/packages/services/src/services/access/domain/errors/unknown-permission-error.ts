/** A custom role names permission ids that are not registered tenant permissions → 422 UNKNOWN_PERMISSION. */
export class UnknownPermissionError extends Error {
  readonly code = "UNKNOWN_PERMISSION";
  readonly permissionIds: readonly string[];

  constructor(permissionIds: readonly string[], options?: ErrorOptions) {
    super(`unknown tenant permissions: ${permissionIds.join(", ")}`, options);
    this.name = "UnknownPermissionError";
    this.permissionIds = permissionIds;
  }
}
