/** Removing or demoting the last owner grant of an organization (SP1 spec §5.3) → 422 LAST_OWNER. */
export class LastOwnerError extends Error {
  readonly code = "LAST_OWNER";
  readonly tenantId: string;

  constructor(tenantId: string, options?: ErrorOptions) {
    super("the organization must keep at least one owner", options);
    this.name = "LastOwnerError";
    this.tenantId = tenantId;
  }
}
