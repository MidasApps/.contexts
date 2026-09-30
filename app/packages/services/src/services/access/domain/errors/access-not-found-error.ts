export type AccessResource = "role" | "membership" | "member" | "invitation" | "organization" | "user";

/** A role, membership, member, invitation, organization or user does not exist (or is gone) → 404 NOT_FOUND. */
export class AccessNotFoundError extends Error {
  readonly code = "NOT_FOUND";
  readonly resource: AccessResource;

  constructor(resource: AccessResource, options?: ErrorOptions) {
    super(`${resource} not found`, options);
    this.name = "AccessNotFoundError";
    this.resource = resource;
  }
}
